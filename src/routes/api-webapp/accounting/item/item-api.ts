import express, { Request, Response } from 'express';
import { Item } from './item-model';
import {
    createItem,
    getActiveItemsByCompany,
    getAllItemsByCompany,
    getItemById,
    updateItem,
    deactivateItem,
    activateItem,
    deleteItem,
    searchItems
} from './item-handler';
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from '../../../../db/core/control-db';

const router = express.Router();

// POST /accounting/item/createItem
router.post("/createItem/", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { itemType, quantity, hsn, sac } = req.body;

        // Validation: products should have HSN, services should have SAC
        if (itemType === 'product' && !hsn) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "HSN code is required for products",
            });
        }

        if (itemType === 'service' && !sac) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "SAC code is required for services",
            });
        }

        // Validation: quantity only for products
        if (itemType === 'service' && quantity) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Quantity is not applicable for services",
            });
        }

        const data = await createItem(req.body, t);
        await t.commit();

        return res.status(200).json({
            success: true,
            message: "Item created successfully",
            data,
        });

    } catch (err: any) {
        await t.rollback();
        console.error("Create Item Error:", err);
        return serverError(res, err?.message || "Failed to create item.");
    }
});

// GET /accounting/item/getItemById/:id?companyId=
router.get("/getItemById/:id", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getItemById(
            req.params.id,
            req.query.companyId as string
        );

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Item not found",
            });
        }

        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch item.");
    }
});

// GET /accounting/item/getActiveItems?companyId=&itemType=
router.get("/getActiveItems", async (req: Request, res: Response): Promise<any> => {
    try {
        const itemType = req.query.itemType as 'product' | 'service' | undefined;
        
        const data = await getActiveItemsByCompany(
            req.query.companyId as string,
            itemType
        );
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch items.");
    }
});

// GET /accounting/item/getAllItems?companyId=&itemType=
router.get("/getAllItems", async (req: Request, res: Response): Promise<any> => {
    try {
        const itemType = req.query.itemType as 'product' | 'service' | undefined;
        
        const data = await getAllItemsByCompany(
            req.query.companyId as string,
            itemType
        );
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch items.");
    }
});

// GET /accounting/item/searchItems?companyId=&itemName=&itemType=&sku=&minPrice=&maxPrice=&minQuantity=&maxQuantity=&unitId=
router.get("/searchItems", async (req: Request, res: Response): Promise<any> => {
    try {
        const { 
            companyId, 
            itemName, 
            itemType, 
            sku, 
            minPrice, 
            maxPrice, 
            minQuantity, 
            maxQuantity, 
            unitId 
        } = req.query;

        // Build filters object
        const filters: any = {};
        if (itemName) filters.itemName = itemName as string;
        if (itemType) filters.itemType = itemType as 'product' | 'service';
        if (sku) filters.sku = sku as string;
        if (minPrice) filters.minPrice = parseFloat(minPrice as string);
        if (maxPrice) filters.maxPrice = parseFloat(maxPrice as string);
        if (minQuantity) filters.minQuantity = parseFloat(minQuantity as string);
        if (maxQuantity) filters.maxQuantity = parseFloat(maxQuantity as string);
        if (unitId) filters.unitId = unitId as string;

        const data = await searchItems(
            companyId as string,
            filters
        );
        
        res.json({ success: true, data, count: data.length });
    } catch (err) {
        return serverError(res, "Failed to search items.");
    }
});

// PATCH /accounting/item/updateItem/:id?companyId=
router.patch("/updateItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await updateItem(
            req.params.id,
            req.query.companyId as string,
            req.body,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Item not found",
            });
        }

        const updatedItem = await getItemById(
            req.params.id,
            req.query.companyId as string
        );

        await t.commit();
        return res.json({
            success: true,
            message: "Item updated successfully",
            data: updatedItem,
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update item");
    }
});

// PATCH /accounting/item/deactivateItem/:id?companyId=
router.patch("/deactivateItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await deactivateItem(
            req.params.id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Item not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Item deactivated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to deactivate item");
    }
});

// PATCH /accounting/item/activateItem/:id?companyId=
router.patch("/activateItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await activateItem(
            req.params.id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Item not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Item activated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to activate item");
    }
});

// DELETE /accounting/item/deleteItem/:id?companyId=
router.delete("/deleteItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const affectedRows = await deleteItem(
            req.params.id,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Item not found",
            });
        }

        await t.commit();
        res.status(200).json({ 
            success: true, 
            message: "Item deleted successfully" 
        });
    } catch (err) {
        await t.rollback();
        serverError(res, "Failed to delete item");
    }
});

export default router;
