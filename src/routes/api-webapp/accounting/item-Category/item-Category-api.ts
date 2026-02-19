import express, { Request, Response } from 'express';
import {
    createItemCategory,
    getActiveItemCategoriesByCompany, getItemCategoryById,
    updateItemCategory,
    deactivateItemCategory,
    deleteItemCategory,
} from './item-Category-handler';
import { serverError, successResponse, unauthorized,errorResponse } from "../../../../utils/responseHandler";
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';

const router = express.Router();

//POST /accounting/item-Category/createItemCategory
router.post("/createItemCategory/", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const companyId =req.body;
        if (!companyId) {
            await t.rollback();
            return errorResponse(res, "companyId is required", null, 400);
        }
        const { categoryName,categoryType } = req.body;
        if (!categoryType || (categoryType !== "Product" && categoryType !== "Service")) {
            await t.rollback();
            return errorResponse(res, "categoryType is required", null, 400);
        }
         if (!categoryName || String(categoryName).trim() === "") {
            await t.rollback();
            return errorResponse(res, "categoryName is required", null, 400);
        }
        const data = await createItemCategory(req.body, t);
        await t.commit();

        return successResponse(res, "Category created successfully", data);

    } catch (err:any) {
        await t.rollback();
        if(err.name==="ValidationError")
        {
            return res.status(400).json({ success: false, message: err.message });
        }
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
    return successResponse(res, "Category details retrieved successfully", data);
}
);


//GET accounting/item-Category?companyId=
router.get("/getActiveItemCategoriesByCompany", async (req, res): Promise<any> => {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const categoryType = req.query.categoryType === "Product" || req.query.categoryType === "Service" ? req.query.categoryType : undefined;

    if (!companyId) {
        return errorResponse(res,"companyId is required", null, 400);
    }
    const data = await getActiveItemCategoriesByCompany(
        companyId,
        categoryType
    );
    return successResponse(res, "Active item categories retrieved successfully", data);
});


//PATCH /accounting/item-Category/updateItemCategory:id
router.patch("/updateItemCategory/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined
        if (!companyId) {
            await t.rollback();
            return errorResponse(res, "companyId is required", null, 400);
        }
        const updatedCategory = await updateItemCategory(
            id,
            companyId as string,
            req.body,
            t
        );

        if (!updatedCategory) {
            await t.rollback();
            return errorResponse(res, "Category not found", null, 404);
        }

        await t.commit();
        return successResponse(res, "Category updated successfully", updatedCategory);
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
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
        if (!companyId) {
            await t.rollback();
            return errorResponse(res, "companyId is required", null, 400);
        };
        const data = await deactivateItemCategory(
            id,
            companyId as string,
            t
        );

        if (!data) {
            await t.rollback();
            return errorResponse(res, "Category not found", null, 404);
        }

        await t.commit();
        return successResponse(res, "Category deactivated successfully", data);
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
        const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
        if (!companyId) {
            await t.rollback();
            return errorResponse(res, "companyId is required", null, 400);
        }
        const data = await deleteItemCategory(
            id,
            companyId as string,
            t
        );


        if (!data) {
            await t.rollback();
            return errorResponse(res, "Category not found", null, 404);
        }

        await t.commit();
        return successResponse(res, "Deleted item successfully", data);
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to delete category");
    }
});

export default router;