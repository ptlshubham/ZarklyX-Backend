import express, { Request, Response } from 'express';
import {
    createItAssets,
    getItAssetsById,
    getAllItAssetsByCompanyAndClientId,
    updateItAssetsDetails,
    deleteItAssetsById,
} from './it-Assets-Management-handler';
import { convertToRelativePath } from '../../../../services/multer';
import { createItAssetsAttachments, removeItAssetsAttachmentByUser } from "./it-Assets-Management-Attachments/it-Assets-Management-Attachments-handler";
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';
import { assetAttachmentUpload } from '../../../../services/multer';
import {serverError,successResponse, errorResponse,unauthorized} from '../../../../utils/responseHandler';
import { runAssetExpiryReminder } from './it-Assets-Management-warranty-cron';


const router = express.Router();

//create asset route POST /itManagement/itAssetsManagement/createItAssets
router.post("/createItAssets", assetAttachmentUpload.array("attachments", 100), async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { userId, companyId, userType } = req.body;
        let clientId: string | null = null;
        if (!userId || !companyId || !userType) {
            await t.rollback();
            return errorResponse(res, "userId, companyId and userType are required", null, 400);
        }
        if (typeof userType !== "string") {
            await t.rollback();
            return errorResponse(res, "Invalid userType value.", null, 400);
        }
        const attachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );

        const assetPayload = {
            ...req.body,
            companyId,
            clientId,
            attachments,
        }
        const data = await createItAssets(assetPayload, t);
        if (!data) {
            await t.rollback();
            return errorResponse(res, "Asset not created", JSON.stringify(data), 400);
        }
        if (attachments.length > 0) {
            await createItAssetsAttachments(data.id, attachments, t);
        }

        await t.commit();
        return successResponse(res, "Asset created successfully", data);
    } catch (error: any) {
        await t.rollback();
        const msg = error?.message || "Unknown error";
        if (error?.name === "ValidationError") {
            return res.status(400).json({ success: false, message: msg, error: null });
        }
        if (error?.name === "UnauthorizedError") {
            return unauthorized(res, msg);
        }
        return serverError(res,"Failed to create asset.", msg);
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
            return errorResponse(res, "companyId is required", null, 400)
        }

        const data = await getItAssetsById(id, companyId as string);

        if (!data) {
            return errorResponse(res, "Asset not found", null, 404);
        }

        return successResponse(res, "Asset retrieved successfully", data);
    } catch (err: any) {
        return serverError(res,"Failed to get asset by id.", err.message);
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

        return successResponse(res, "Assets retrieved successfully", data);
    } catch (err: any) {
        return serverError(res,"Failed to get assets by company and client id.", err.message);
    }
});

//PATCH /itManagement/itAssetsManagement/updateItAssetsDetails/:id/:companyId
router.patch("/updateItAssetsDetails/:id/:companyId", assetAttachmentUpload.array("attachments", 100), async (req, res): Promise<any> => {

    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        let companyId = req.params.companyId;
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
            return errorResponse(res, "Asset id and companyId are required", null, 400);
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
            return errorResponse(res, "At least one field is required to update.", null, 400);
        }


        const updatedItAsset = await updateItAssetsDetails(id, companyId, req.body, t);
        if (!updatedItAsset) {
            await t.rollback();
            return errorResponse(res, "Asset not found or unauthorized update", null, 404);
        }
        if (newAttachments.length > 0) {
            await createItAssetsAttachments(updatedItAsset.id, newAttachments, t);
        }

        await t.commit();
        return successResponse(res, "Asset updated successfully", updatedItAsset);
    } catch (error: any) {
        await t.rollback();
        const msg = error?.message || "Unknown error";
        if (error?.name === "ValidationError") {
            return res.status(400).json({ success: false, message: msg });
        }
        return serverError(res,"Failed to update asset details.", msg);
    }
});

//DELETE /itManagement/itAssetsManagement/deleteItAssetsById/:id/:companyId
router.delete("/deleteItAssetsById/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const asset = await deleteItAssetsById(id, companyId, t);
        if (!asset) {
            await t.rollback();
            return errorResponse(res, "Asset not found or unauthorized delete", null, 404);
        }
        await t.commit();
        return successResponse(res, "Asset deleted successfully", asset.id);
    }
    catch (error: any) {
        await t.rollback();
        return serverError(res,"Failed to delete asset.", error?.message || null);
    }
});

//DELETE /itManagement/itAssetsManagement/removeItAssetsAttachmentsByUser/:id/:companyId
router.patch("/removeItAssetsAttachmentsByUser/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { attachmentId } = req.body;
        if (!id || !companyId || !attachmentId) {
            await t.rollback();
            return errorResponse(res, "id, companyId and  attachmentId is required", null, 400);
        }
        const result = await removeItAssetsAttachmentByUser(id, companyId, attachmentId, t);
        if (!result) {
            await t.rollback();
            return errorResponse(res, "Attachment not found", null, 404);
        }
        await t.commit();
        return successResponse(res, "Attachment removed successfully", result);
    }
    catch (error: any) {
        await t.rollback();
        return serverError(res,"Failed to remove attachment.", error?.message || null);
    }
});

export default router;