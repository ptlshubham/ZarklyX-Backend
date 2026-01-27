import express, { Request, Response } from 'express';
import { ItAssetsManagement } from './it-Assets-Management-model';
import {
    createItAssets,
    getItAssetsById,
    getAllItAssetsByCompanyAndClientId,
    updateItAssetsDetails,
    deleteItAssetsById,
} from './it-Assets-Management-handler';
import { serverError, success, unauthorized } from "../../../../utils/responseHandler";
import { convertToRelativePath } from '../../../../services/multer';
import { createItAssetsAttachments, removeItAssetsAttachmentByUser } from "./it-Assets-Management-Attachments/it-Assets-Management-Attachments-handler";
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';
import {Clients} from "../../agency/clients/clients-model";
import { assetAttachmentUpload } from '../../../../services/multer';
import { runAssetExpiryReminder } from './it-Assets-Management-warranty-cron';
import path from "path";

const router = express.Router();

//create asset route POST /itManagement/itAssetsManagement/createItAssets
router.post("/createItAssets", assetAttachmentUpload.array("attachments", 100), async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { userId, companyId, userType } = req.body;
        let clientId: string | null = null;
        if (!userId || !companyId || !userType) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "userId, companyId and userType are required."
            })
        }
        if(typeof userType !== "string" ){
            await t.rollback();
            return res.status(400).json({
                success:false,
                message:"Invalid userType value."
            });
        }
        if(userType === "client")
        {
            const client =await Clients.findOne({
                where: {userId, companyId, isDeleted: false},
                transaction: t
            });
            if(!client)
            {
                await t.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Client not found for the given userId and companyId."

                });
            }
            clientId= client.id;
        }
       const attachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );

      
        const ASSET_TYPE = ["Product", "Service"]
        if (req.body.assetType && !ASSET_TYPE.includes(req.body.assetType)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid assetType value",
            });
        }
        const PAYMENT_MODE = ["UPI", "Cash", "Card", "Cheque", "Net Banking", "RTGS", "Bank Transfer", "NEFT", "Other"];
        if (req.body.paymentMode && !PAYMENT_MODE.includes(req.body.paymentMode)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid paymentMode value",
            });
        }
        const PAYMENT_STATUS = ["Paid", "Pending"];
        if (req.body.paymentStatus && !PAYMENT_STATUS.includes(req.body.paymentStatus)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid paymentStatus value",
            });
        }
        const PURCHASED_BY = ["Company", "Client"];
        if (req.body.purchasedBy && !PURCHASED_BY.includes(req.body.purchasedBy)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid purchasedBy value",
            });
        }
        const PAID_BY = ["Company", "Client"];
        if (req.body.paidBy && !PAID_BY.includes(req.body.paidBy)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid paidBy value",
            });
        }

        const assetPayload={
            ...req.body,
            companyId,
            clientId,
            attachments,
        }
        const data = await createItAssets(assetPayload, t);
        if (!data) {
            return res.status(400).json({
                success: true,
                message: "Asset not created",
                data,
            });
        }
        if (attachments.length > 0) {
            await createItAssetsAttachments(data.id, attachments, t);
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Asset created successfully",
            data,
        });
    } catch (error) {
        console.error("[CREATE ASSET ERROR]", error);
        await t.rollback();
        return serverError(res, "Failed to create asset.", (error as any)?.message || String(error));
    }
}
);

//GET /itManagement/itAssetsManagement/getItAssetsById/:id
router.get("/getItAssetsById/:id", async (req, res): Promise<any> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const { companyId } = req.query;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: "companyId is required",
            });
        }

        const data = await getItAssetsById(id, companyId as string);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Asset not found",
            });
        }

        return res.status(200).json({
            success: true,
            data,
        })
    } catch (err) {
        return serverError(res, "Failed to get asset by id.");
    }
})


//GET /itManagement/itAssetsManagement/getAllItAssetsByCompanyAndClientId/?companyId=&clientId=&assetType=&category=
router.get("/getAllItAssetsByCompanyAndClientId/", async (req, res): Promise<any> => {
    try {
        const { companyId, clientId, assetType, categoryId } = req.query;

        const data = await getAllItAssetsByCompanyAndClientId({
            companyId: companyId as string,
            clientId: clientId as string,
            assetType: assetType as string,
            categoryId: categoryId as string,
        });

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (err) {
        return serverError(res, "Failed to get assets by company and client id.");
    }
});

//PATCH /itManagement/itAssetsManagement/updateItAssetsDetails/:id/:companyId
router.patch("/updateItAssetsDetails/:id/:companyId", assetAttachmentUpload.array("attachments", 100), async (req, res): Promise<any> => {

    const t = await dbInstance.transaction();
    try {
        let id= req.params.id;
        let companyId= req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const {
            assetName,
            purchaseDate,
            startDate,
            endDate,
            warrantyStartDate,
            warrantyEndDate,
            renewalReminderDate,
            paymentMode,
            paymentStatus,
            purchasedBy,
            currencyCode,
            paidBy,
            price,
            quantity,
            isClientPaymentReceived,
        } = req.body;

        const newAttachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );

        if (!req.params.id || !req.params.companyId) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Asset id and companyId are required.",
            });
        }

        const PAYMENT_MODE = ["UPI", "Cash", "Card", "Cheque", "Net Banking", "RTGS", "Bank Transfer", "NEFT", "Other"];
        if (req.body.paymentMode && !PAYMENT_MODE.includes(req.body.paymentMode)) {
            return res.status(400).json({
                success: false,
                message: "Invalid paymentMode value",
            });
        }

        const PAYMENT_STATUS = ["Paid","Pending"];
        if (req.body.paymentStatus && !PAYMENT_STATUS.includes(req.body.paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid paymentStatus value",
            });
        }

        const PURCHASED_BY = ["Company", "Client"];
        if (req.body.purchasedBy && !PURCHASED_BY.includes(req.body.purchasedBy)) {
            return res.status(400).json({
                success: false,
                message: "Invalid purchasedBy value",
            });
        }
        const PAID_BY = ["Company", "Client"];
        if (req.body.paidBy && !PAID_BY.includes(req.body.paidBy)) {
            return res.status(400).json({
                success: false,
                message: "Invalid paidBy value",
            });
        }


        if (
            assetName === undefined &&
            purchaseDate === undefined &&
            startDate === undefined &&
            endDate === undefined &&
            warrantyStartDate === undefined &&
            warrantyEndDate === undefined &&
            renewalReminderDate === undefined &&
            paymentMode === undefined &&
            paymentStatus === undefined &&
            purchasedBy === undefined &&
            currencyCode === undefined &&
            paidBy === undefined &&
            price === undefined &&
            quantity === undefined &&
            isClientPaymentReceived === undefined &&
            newAttachments.length === 0
        ) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "At least one field is required to update.",
            });
        }


        const updatedItAsset = await updateItAssetsDetails(id, companyId, req.body, t);
        if (!updatedItAsset) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Asset not found or unauthorized update",
            });
        }
        if (newAttachments.length > 0) {
            await createItAssetsAttachments(updatedItAsset.id, newAttachments, t);
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Asset updated successfully",
            data: updatedItAsset,
        });
    } catch (error) {
        await t.rollback();
        return serverError(res, "Failed to update asset.");
    }
});

//DELETE /itManagement/itAssetsManagement/deleteItAssetsById/:id/:companyId
router.delete("/deleteItAssetsById/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id= req.params.id;
        let companyId= req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const asset = await deleteItAssetsById(id, companyId, t);
        if (!asset) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Asset not found",
            });
        }
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Asset deleted successfully",
            id: asset.id,
        });
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to delete asset.");
    }
});

//DELETE /itManagement/itAssetsManagement/removeItAssetsAttachmentsByUser/:id/:companyId
router.patch("/removeItAssetsAttachmentsByUser/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        // const { id, companyId } = req.params;
        let id= req.params.id;
        let companyId= req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { attachmentId } = req.body;
        if (!id || !companyId || !attachmentId) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "id, companyId and  attachmentId is required",
            });
        }
        const result = await removeItAssetsAttachmentByUser(id, companyId, attachmentId, t);
        if (!result) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Attachment not found",
            });
        }
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Attachment removed successfully",
            result,
        });
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to remove attachment.");
    }
});

//  TEST ROUTE - For development/manual testing only
// Uncomment if needed for testing warranty reminder emails in dev environment

// router.post(
//     "/test/asset-expiry-reminder",
//     async (req, res): Promise<any> => {
//         try {
//             console.log("[DEV API] Asset expiry reminder test triggered");

//             await runAssetExpiryReminder();

//             return res.status(200).json({
//                 success: true,
//                 message: "Asset expiry reminder executed (LOG ONLY)",
//             });
//         } catch (error: any) {
//             console.error("[DEV API] Asset expiry reminder error", error);
//             return res.status(500).json({
//                 success: false,
//                 error: error?.message || "Internal error",
//             });
//         }
//     }
// );


export default router;