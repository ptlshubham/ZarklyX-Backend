import express, { Request, Response } from 'express';
import { ItemCategory } from './item-Category-model';
import {
    createItemCategory,
    getActiveItemCategoriesByCompany, getItemCategoryById,
    updateItemCategory,
    deactivateItemCategory,
    deleteItemCategory,
    // getUniqueItAssetCategories
} from './item-Category-handler';
import { serverError, success, unauthorized } from "../../../../utils/responseHandler";
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';

const router = express.Router();

//POST /accounting/item-Category/createItemCategory
router.post("/createItemCategory/", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createItemCategory(req.body, t);
        await t.commit();

        return res.status(200).json({
            success: true,
            message: "Category created successfully",
            data,
        });

    } catch (err) {
        await t.rollback();
        console.error("Create Category Error:", err);
        return serverError(res, "Failed to create Category.");

    }
});

//GET /accounting/item-Category/getItemCategoryById:id
router.get("/getItemCategoryById/:id", async (req: Request, res: Response): Promise<any> => {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const data = await getItemCategoryById(
        id,
        req.query.companyId as string
    );
    res.json({ success: true, data });
}
);


//GET accounting/item-Category?companyId=
router.get("/getActiveItemCategoriesByCompany", async (req, res): Promise<any> => {
     const companyId =typeof req.query.companyId === "string" ? req.query.companyId: undefined; 
    const categoryType = req.query.categoryType === "Product" || req.query.categoryType === "Service" ? req.query.categoryType : undefined;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "companyId is required",
        });
    }
    const data = await getActiveItemCategoriesByCompany(
        companyId,
        categoryType
    );
    res.json({ success: true, data });
});


//PATCH /accounting/item-Category/updateItemCategory:id
router.patch("/updateItemCategory/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const updatedCategory = await updateItemCategory(
            id,
            req.query.companyId as string,
            req.body,
            t
        );

        if (!updatedCategory) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Category not found",
            });
        }

        await t.commit();
        return res.json({
            success: true,
            message: "Category updated successfully",
            data: updatedCategory,
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update category");
    }
}
);

//PATCH /accounting/item-Category/deactivateItemCategory/:id
router.patch("/deactivateItemCategory/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const data = await deactivateItemCategory(
            id,
            req.query.companyId as string,
            t
        );

        if (!data) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Category not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Category deactivated successfully",
            data,
        });
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to deactivate category");
    }
}
);

//DELETE /accounting/item-Category/deleteItemCategory/:id
router.delete("/deleteItemCategory/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const data = await deleteItemCategory(
            id,
            req.query.companyId as string,
            t
        );


        if (!data) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Category not found",
            });
        }

        await t.commit();
        res.status(200).json({ success: true, message: "Deleted item successfully", data });
    } catch (err) {
        await t.rollback();
        serverError(res, "Failed to delete category");
    }
});

export default router;