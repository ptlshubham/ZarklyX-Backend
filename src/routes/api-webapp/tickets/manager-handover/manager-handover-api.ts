import express, { Request, Response } from 'express';
import { ManagerHandover } from './manager-handover-model';
import {
    createManagerHandover,
    completeHandover,
    cancelHandover,
    getEffectiveManager,
    getHandoverById,
    getAllActiveHandovers,
    getActiveHandoversByCompany,
    getHandoverHistory,
    adminAssignHandover
} from './manager-handover-handler';
import { serverError, success } from "../../../../utils/responseHandler";
import dbInstance from '../../../../db/core/control-db';
import {
    requestHandover,
    acceptHandover,
    rejectHandover
} from "./manager-handover-handler";
const router = express.Router();

// POST /createManagerHandover/
router.post("/createManagerHandover", async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
        const { managerId, backupManagerId, companyId, notes, userId } = req.body;

        if (!managerId || !backupManagerId || !companyId || !userId) {
            await transaction.rollback();
            return res.status(400).json({ success:false, message: "managerId, backupManagerId, companyId and userId are required" });
        }


        const handover = await createManagerHandover(
            { managerId, backupManagerId, companyId, notes },
            userId,
            transaction
        );

        await transaction.commit();
        return res.status(201).json({
            success: true,
            message: "Handover created successfully",
            data: handover
        });
    } catch (error: any) {
        await transaction.rollback();
        return serverError(res, error.message || "Failed to create handover");
    }
});

//PUT /completeManagerHandover/:id
router.put("/completeManagerHandover/:id", async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];

        const { userId } = req.body;

        if (!userId) {
            await transaction.rollback();
            return res.status(400).json({ success:false, message: "userId is required" });
        }

        const handover = await completeHandover(id, userId, transaction);

        await transaction.commit();
        success(res, handover, "Handover completed successfully");
    } catch (error: any) {
        await transaction.rollback();
        serverError(res, error.message);
    }
});

// PUT /cancelManagerHandover/:id
router.put("/cancelManagerHandover/:id", async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const { userId } = req.body;

        if (!userId) {
            await transaction.rollback();
            return res.status(400).json({ message: "userId is required" });
        }

        const handover = await cancelHandover(id, userId, transaction);

        await transaction.commit();
        success(res, handover, "Handover cancelled successfully");
    } catch (error: any) { 
        await transaction.rollback();
        serverError(res, error.message);
    }
});

// GET /getEffectiveManager/:managerId
router.get("/getEffectiveManager/:managerId", async (req: Request, res: Response) => {
    try {
        let managerId = req.params.managerId;
        if (Array.isArray(managerId)) managerId = managerId[0];

        const effectiveManagerId = await getEffectiveManager(managerId);

        success(res, {
            originalManagerId: managerId,
            effectiveManagerId: effectiveManagerId,
            isHandoverActive: managerId !== effectiveManagerId
        }, "Effective manager resolved");
    } catch (error: any) {
        serverError(res, error.message);
    }
});

//GET /getHandoverById/:id
router.get("/getHandoverById/:id", async (req: Request, res: Response) => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];

        const handover = await getHandoverById(id);

        if (!handover) {
            return res.status(404).json({ message: "Handover not found" });
        }

        success(res, handover, "Handover retrieved successfully");
    } catch (error: any) {
        serverError(res, error.message);
    }
});

//GET /getAllActiveHandovers
router.get("/getAllActiveHandovers", async (req: Request, res: Response) => {
    try {
        const handovers = await getAllActiveHandovers();

        success(res, handovers, "Active handovers retrieved successfully");
    } catch (error: any) {
        serverError(res, error.message);
    }
});

//GET /getActiveHandoversByCompany/:companyId
router.get("/getActiveHandoversByCompany/:companyId", async (req: Request, res: Response) => {
    try {
        let companyId = req.params.companyId;
        if (Array.isArray(companyId)) companyId = companyId[0];

        const handovers = await getActiveHandoversByCompany(companyId);

        success(res, handovers, "Company active handovers retrieved successfully");
    } catch (error: any) {
        serverError(res, error.message);
    }
});

// GET /getHandoverHistory/:managerId
router.get("/getHandoverHistory/:managerId", async (req: Request, res: Response) => {
    try {
        let managerId = req.params.managerId;
        if (Array.isArray(managerId)) managerId = managerId[0];

        const history = await getHandoverHistory(managerId);

        success(res, history, "Handover history retrieved successfully");
    } catch (error: any) {
        serverError(res, error.message);
    }
});


router.post("/request", async (req: Request, res: Response) => {

    const transaction = await dbInstance.transaction();

    try {

        const {
            managerId,
            backupManagerId,
            companyId,
            startDate,
            endDate,
            notes,
            userId
        } = req.body;

        if (!managerId || !backupManagerId || !companyId || !userId) {

            await transaction.rollback();

            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        const handover = await requestHandover({
            managerId,
            backupManagerId,
            companyId,
            startDate,
            endDate,
            notes
        }, userId, transaction);


        await transaction.commit();

        return res.status(201).json({
            success: true,
            data: handover
        });

    } catch (error: any) {

        await transaction.rollback();

        return serverError(res, error.message);
    }

});

router.post("/:id/accept", async (req: Request, res: Response) => {

    const transaction = await dbInstance.transaction();

    try {

        let handoverId = req.params.id;
        if (Array.isArray(handoverId)) handoverId = handoverId[0];

        const { userId } = req.body;

        const handover = await acceptHandover(
            handoverId,
            userId,
            transaction
        );

        await transaction.commit();

        return success(res, handover, "Handover accepted");

    } catch (error: any) {

        await transaction.rollback();

        return serverError(res, error.message);
    }

});

router.post("/:id/reject", async (req: Request, res: Response) => {

    const transaction = await dbInstance.transaction();

    try {

        let handoverId = req.params.id;
        if (Array.isArray(handoverId)) handoverId = handoverId[0];

        const { userId } = req.body;

        const handover = await rejectHandover(
            handoverId,
            userId,
            transaction
        );

        await transaction.commit();

        return success(res, handover, "Handover rejected");

    } catch (error: any) {

        await transaction.rollback();

        return serverError(res, error.message);
    }

});

router.post("/admin-assign", async (req, res) => {

    const transaction = await dbInstance.transaction();

    try {

        const {
            managerId,
            backupManagerId,
            companyId,
            userId
        } = req.body;

        const handover = await adminAssignHandover({

            managerId,
            backupManagerId,
            companyId

        }, userId, transaction);

        await transaction.commit();

        success(res, handover, "Handover assigned successfully");

    }
    catch (e:any){

        await transaction.rollback();
        serverError(res,e.message);

    }

});
export default router;
