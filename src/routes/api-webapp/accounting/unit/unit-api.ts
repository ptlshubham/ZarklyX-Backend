import express, { Request, Response } from 'express';
import { Unit } from './unit-model';
import {
    createUnit,
    getActiveUnitsByCompany,
    getUnitById,
    updateUnit,
    deactivateItemUnit,
    setActiveUnit,
    deleteItemUnit
} from './unit-handler';
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from '../../../../db/core/control-db';

const router = express.Router();

// POST /accounting/unit/createUnit
router.post("/createUnit/", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createUnit(req.body, t);
        await t.commit();

        return res.status(200).json({
            success: true,
            message: "Unit created successfully",
            data,
        });

    } catch (err) {
        await t.rollback();
        console.error("Create Unit Error:", err);
        return serverError(res, "Failed to create unit.");
    }
});

// GET /accounting/unit/getUnitById/:id
router.get("/getUnitById/:id", async (req: Request, res: Response): Promise<any> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const data = await getUnitById(
            id,
            req.query.companyId as string
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Unit not found",
            });
        }

        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch unit.");
    }
});

// GET /accounting/unit/getActiveUnitsByCompany?companyId=
router.get("/getActiveUnitsByCompany", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getActiveUnitsByCompany(
            req.query.companyId as string
        );
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch units.");
    }
});

// PATCH /accounting/unit/updateUnit/:id
router.patch("/updateUnit/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const [affectedRows] = await updateUnit(
            id,
            req.query.companyId as string,
            req.body,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Unit not found",
            });
        }

        await t.commit();
        return res.json({
            success: true,
            message: "Unit updated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update unit");
    }
});

// PATCH /accounting/unit/deactivateUnit/:id
router.patch("/deactivateUnit/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const [affectedRows] = await deactivateItemUnit(
            id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Unit not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Unit deactivated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to deactivate unit");
    }
});

// PATCH /accounting/unit/activateUnit/:id
router.patch("/activateUnit/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const [affectedRows] = await setActiveUnit(
            id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Unit not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Unit activated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to activate unit");
    }
});

// DELETE /accounting/unit/deleteUnit/:id
router.delete("/deleteUnit/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const affectedRows = await deleteItemUnit(
            id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Unit not found",
            });
        }

        await t.commit();
        res.status(200).json({ 
            success: true, 
            message: "Unit deleted successfully" 
        });
    } catch (err) {
        await t.rollback();
        serverError(res, "Failed to delete unit");
    }
});

export default router;
