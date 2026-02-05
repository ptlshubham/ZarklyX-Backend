import express, { Request, Response } from 'express';
import { Item } from './item-model';
import { Unit } from '../unit/unit-model';
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
import { authMiddleware } from '../../../../middleware/auth.middleware';

const router = express.Router();

// POST /accounting/item/createItem
router.post("/createItem/", authMiddleware, async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { items } = req.body;
        
        // Check if items array exists
        if (!items || !Array.isArray(items) || items.length === 0) {
            await t.rollback();
            console.error("Items array validation failed:", { items });
            return res.status(400).json({
                success: false,
                message: "Items array is required and must not be empty",
            });
        }

        // Get companyId from authenticated user
        const user: any = (req as any).user;
        const companyId = user?.companyId || req.body.companyId;

        console.log("Auth user:", user);
        console.log("CompanyId:", companyId);

        if (!companyId) {
            await t.rollback();
            console.error("Company ID not found in request:", { user, bodyCompanyId: req.body.companyId });
            return res.status(400).json({
                success: false,
                message: "Company ID is required. Please ensure you are logged in.",
            });
        }

        const createdItems = [];

        // Process each item
        for (const item of items) {
            const { itemType, hsnCode, sacCode, openingQty, unitPrice, currency, unit } = item;

            // Validation: products should have HSN, services should have SAC
            if (itemType === 'product' && !hsnCode) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: "HSN code is required for products",
                });
            }

            if (itemType === 'service' && !sacCode) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: "SAC code is required for services",
                });
            }

            // Validation: unitPrice is required
            if (!unitPrice && unitPrice !== 0) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Unit Price is required",
                });
            }

            // Lookup or create unitId from unit code
            let unitId = null;
            if (unit && unit.trim()) {
                let unitRecord = await Unit.findOne({
                    where: {
                        unitCode: unit.trim(),
                        companyId: companyId,
                        isDeleted: false
                    },
                    transaction: t
                });

                // If unit doesn't exist, create it
                if (!unitRecord) {
                    console.log(`Unit with code "${unit}" not found, creating new unit...`);
                    unitRecord = await Unit.create(
                        {
                            companyId: companyId,
                            unitCode: unit.trim(),
                            unitName: unit.trim(), // Use same as code if name not provided
                            isActive: true,
                            isDeleted: false
                        },
                        { transaction: t }
                    );
                    console.log(`Created new unit: ${unitRecord.id}`);
                }

                unitId = unitRecord.id;
                console.log(`Using unitId: ${unitId} for unit code: ${unit}`);
            }

            // Map frontend fields to backend model with proper null handling
            const mappedItem = {
                companyId: companyId,
                itemType: itemType,
                itemName: item.itemName?.trim() || '',
                description: item.description?.trim() || null,
                quantity: itemType === 'product' && openingQty ? parseFloat(openingQty.toString()) : null,
                unitId: unitId,
                tax: item.tax ? parseFloat(item.tax.toString()) : null,
                hsn: itemType === 'product' ? (hsnCode?.trim() || null) : null,
                sac: itemType === 'service' ? (sacCode?.trim() || null) : null,
                sku: item.sku?.trim() || null,
                unitPrice: parseFloat(unitPrice.toString()),
                currency: currency?.trim() || 'INR',
                cessPercentage: item.cessPercent ? parseFloat(item.cessPercent.toString()) : null,
                isActive: true,
                isDeleted: false,
            };

            console.log(`Creating item: ${mappedItem.itemName} (Type: ${mappedItem.itemType})`);
            const createdItem = await createItem(mappedItem, t);
            createdItems.push(createdItem);
        }

        await t.commit();

        return res.status(200).json({
            success: true,
            message: `${createdItems.length} item(s) created successfully`,
            data: createdItems,
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
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const data = await getItemById(
            id,
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
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        
        console.log('=== Update Item Request ===');
        console.log('Item ID:', id);
        console.log('Company ID:', req.query.companyId);
        console.log('Request Body:', JSON.stringify(req.body, null, 2));
        
        // Handle unitId conversion from unitCode if needed
        const updateData = { ...req.body };
        
        if (updateData.unitId) {
            console.log('Processing unitId:', updateData.unitId, 'Type:', typeof updateData.unitId, 'Length:', updateData.unitId.length);
            
            // Check if it's a UUID (36 chars with dashes) or a unit code
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateData.unitId);
            
            if (!isUUID) {
                console.log(`Looking up unit by code: '${updateData.unitId}'`);
                
                // Try to find existing unit by code
                let unit = await Unit.findOne({
                    where: {
                        unitCode: updateData.unitId,
                        companyId: req.query.companyId as string,
                        isActive: true,
                        isDeleted: false
                    }
                });
                
                // If unit doesn't exist, create it
                if (!unit) {
                    console.log(`Unit not found, creating new unit with code: '${updateData.unitId}'`);
                    const unitCodeToNameMap: any = {
                        'box': 'Box', 'cm': 'Cms', 'doz': 'Doz', 'ft': 'FTS', 
                        'g': 'GMS', 'in': 'Inc', 'kg': 'Kgs', 'lb': 'Lbs',
                        'mg': 'Mgs', 'ml': 'Mlt', 'm': 'Mtr', 'pcs': 'Pcs'
                    };
                    
                    unit = await Unit.create({
                        companyId: req.query.companyId as string,
                        unitCode: updateData.unitId,
                        unitName: unitCodeToNameMap[updateData.unitId] || updateData.unitId.toUpperCase(),
                        isActive: true,
                        isDeleted: false
                    }, { transaction: t });
                    
                    console.log(`Created new unit with ID: '${unit.id}'`);
                }
                
                updateData.unitId = unit.id;
                console.log(`Using unitId: '${unit.id}' for unit code '${req.body.unitId}'`);
            } else {
                console.log('unitId is already a UUID, using as-is');
            }
        } else {
            console.log('No unitId in request body');
        }
        
        console.log('Final update data:', JSON.stringify(updateData, null, 2));
        
        const [affectedRows] = await updateItem(
            id,
            req.query.companyId as string,
            updateData,
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
            id,
            req.query.companyId as string
        );

        await t.commit();
        return res.json({
            success: true,
            message: "Item updated successfully",
            data: updatedItem,
        });
    } catch (err) {
        console.error('Error updating item:', err);
        await t.rollback();
        return serverError(res, "Failed to update item");
    }
});

// PATCH /accounting/item/deactivateItem/:id?companyId=
router.patch("/deactivateItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const [affectedRows] = await deactivateItem(
            id,
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
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const [affectedRows] = await activateItem(
            id,
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
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const affectedRows = await deleteItem(
            id,
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