import express, { Request, Response } from 'express';
import { ExpenseItem } from './expense-item-model';
import {
    createExpenseItem,
    getActiveExpenseItemsByCompany,
    getAllExpenseItemsByCompany,
    getExpenseItemById,
    updateExpenseItem,
    deactivateExpenseItem,
    activateExpenseItem,
    deleteExpenseItem,
    searchExpenseItems
} from './expense-item-handler';
import { serverError } from "../../../../../utils/responseHandler";
import dbInstance from '../../../../../db/core/control-db';

const router = express.Router();

// POST /accounting/expenses/expense-item/createExpenseItem
router.post("/createExpenseItem/", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createExpenseItem(req.body, t);
        await t.commit();

        return res.status(200).json({
            success: true,
            message: "Expense Item created successfully",
            data,
        });

    } catch (err: any) {
        await t.rollback();
        console.error("Create Expense Item Error:", err);
        return serverError(res, err?.message || "Failed to create Expense item.");
    }
});

// GET /accounting/expense-item/getExpenseItemById/:id?companyId=
router.get("/getExpenseItemById/:id", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getExpenseItemById(
            req.params.id as string,
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
        return serverError(res, "Failed to fetch Expense item.");
    }
});

// GET /accounting/expense-item/getExpenseItemsByCompanyId?companyId=
router.get("/getExpenseItemsByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
        const companyId = req.query.companyId as string;
        
        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: "Company ID is required",
            });
        }
        
        const data = await getActiveExpenseItemsByCompany(companyId);
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch Expense items.");
    }
});

// GET /accounting/expenses/expense-item/getActiveExpenseItems?companyId=&itemType=
router.get("/getActiveExpenseItems", async (req: Request, res: Response): Promise<any> => {
    try {        
        const data = await getActiveExpenseItemsByCompany(
            req.query.companyId as string
        );
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch Expense items.");
    }
});

// GET /accounting/expenses/expense-item/getAllExpenseItems?companyId=
router.get("/getAllExpenseItems", async (req: Request, res: Response): Promise<any> => {
    try {
        const data = await getAllExpenseItemsByCompany(
            req.query.companyId as string,
        );
        
        res.json({ success: true, data });
    } catch (err) {
        return serverError(res, "Failed to fetch Expense items.");
    }
});

// GET /accounting/expenses/expense-item/searchExpenseItems?companyId=&expenseName=
router.get("/searchExpenseItems", async (req: Request, res: Response): Promise<any> => {
    try {
        const { 
            companyId, 
            expenseName,
        } = req.query;

        // Build filters object
        const filters: any = {};
        if (expenseName) filters.expenseName = expenseName as string;

        const data = await searchExpenseItems(
            companyId as string,
            filters
        );
        
        res.json({ success: true, data, count: data.length });
    } catch (err) {
        return serverError(res, "Failed to search Expense items.");
    }
});

// PATCH /accounting/expenses/expense-item/updateExpenseItem/:id?companyId=
router.patch("/updateExpenseItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await updateExpenseItem(
            req.params.id as string,
            req.query.companyId as string,
            req.body,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Expense Item not found",
            });
        }

        const updatedItem = await getExpenseItemById(
            req.params.id as string,
            req.query.companyId as string
        );

        await t.commit();
        return res.json({
            success: true,
            message: "Expense Item updated successfully",
            data: updatedItem,
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update Expense item");
    }
});

// PATCH /accounting/expenses/expense-item/deactivateExpenseItem/:id?companyId=
router.patch("/deactivateExpenseItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await deactivateExpenseItem(
            req.params.id as string,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Expense Item not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Expense Item deactivated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to deactivate Expense item");
    }
});

// PATCH /accounting/expenses/expense-item/activateExpenseItem/:id?companyId=
router.patch("/activateExpenseItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const [affectedRows] = await activateExpenseItem(
            req.params.id as string,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Expense Item not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Expense Item activated successfully",
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to activate Expense item");
    }
});

// DELETE /accounting/item/deleteExpenseItem/:id?companyId=
router.delete("/deleteExpenseItem/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const affectedRows = await deleteExpenseItem(
            req.params.id as string,
            req.query.companyId as string,
            t
        );

        if (affectedRows === 0) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Expense Item not found",
            });
        }

        await t.commit();
        res.status(200).json({ 
            success: true, 
            message: "Expense Item deleted successfully" 
        });
    } catch (err) {
        await t.rollback();
        serverError(res, "Failed to delete Expense item");
    }
});

export default router;
