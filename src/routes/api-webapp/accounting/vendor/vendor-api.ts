import express, { Request, Response } from 'express';
import { Vendor } from './vendor-model';
import {
    createVendor,
    getActiveVendorsByCompany,
    getAllVendorsByCompany,
    getVendorById,
    updateVendor,
    deactivateVendor,
    activateVendor,
    deleteVendor,
    searchVendors
} from './vendor-handler';
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from '../../../../db/core/control-db';

const router = express.Router();

// POST /accounting/vendor/createVendor
router.post("/createVendor/", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createVendor(req.body, t);
        await t.commit();

        return res.status(200).json({
            success: true,
            message: "Vendor created successfully",
            data,
        });

    } catch (err: any) {
        await t.rollback();
        console.error("Create Vendor Error:", err);
        return serverError(res, err?.message || "Failed to create vendor.");
    }
});

// GET /accounting/vendor/getVendorById/:id?companyId=
router.get("/getVendorById/:id", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getVendorById(
            req.params.id,
            req.query.companyId as string
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch vendor.");
    }
});

// GET /accounting/vendor/getActiveVendors?companyId=
router.get("/getActiveVendors", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getActiveVendorsByCompany(
            req.query.companyId as string
        );
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch vendors.");
    }
});

// GET /accounting/vendor/getAllVendors?companyId=
router.get("/getAllVendors", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getAllVendorsByCompany(
            req.query.companyId as string
        );
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch vendors.");
    }
});

// GET /accounting/vendor/searchVendors?companyId=&companyName=&contactPerson=&email=&phone=&city=
router.get("/searchVendors", async (req: Request, res: Response): Promise<any> => {
    try {
        const { companyId, companyName, contactPerson, email, phone, city } = req.query;

        // Check if at least one search parameter is provided
        if (!companyName && !contactPerson && !email && !phone && !city) {
            return res.status(400).json({
                success: false,
                message: "At least one search parameter is required (companyName, contactPerson, email, phone, or city)",
            });
        }

        const filters: any = {};
        if (companyName) filters.companyName = companyName as string;
        if (contactPerson) filters.contactPerson = contactPerson as string;
        if (email) filters.email = email as string;
        if (phone) filters.phone = phone as string;
        if (city) filters.city = city as string;

        const data = await searchVendors(
            companyId as string,
            filters
        );
        
        res.json({ success: true, data, count: data.length });
    } catch (err) {
        return serverError(res, "Failed to search vendors.");
    }
});

// PATCH /accounting/vendor/updateVendor/:id?companyId=
router.patch("/updateVendor/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await updateVendor(
            req.params.id,
            req.query.companyId as string,
            req.body,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        const updatedVendor = await getVendorById(
            req.params.id,
            req.query.companyId as string
        );

        await t.commit();
        return res.json({
            success: true,
            message: "Vendor updated successfully",
            data: updatedVendor,
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update vendor");
    }
});

// PATCH /accounting/vendor/deactivateVendor/:id?companyId=
router.patch("/deactivateVendor/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await deactivateVendor(
            req.params.id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Vendor deactivated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to deactivate vendor");
    }
});

// PATCH /accounting/vendor/activateVendor/:id?companyId=
router.patch("/activateVendor/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await activateVendor(
            req.params.id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Vendor activated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to activate vendor");
    }
});

// DELETE /accounting/vendor/deleteVendor/:id?companyId=
router.delete("/deleteVendor/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await deleteVendor(
            req.params.id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
        }

        await t.commit();
        res.status(200).json({ 
            success: true, 
            message: "Vendor deleted successfully" 
        });
    } catch (err) {
        await t.rollback();
        serverError(res, "Failed to delete vendor");
    }
});

export default router;
