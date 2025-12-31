import express from "express";
import dbInstance from "../../../../../db/core/control-db";
import { serverError } from "../../../../../utils/responseHandler";
import { tokenMiddleWare } from "../../../../../services/jwtToken-service";
import {
  addCategory,
  getCategoryByID,
  getAllCategorys,
  updateCategory,
  deleteCategory,
} from "../../../superAdmin/generalSetup/category/category-handler";
import { Category } from "../../../superAdmin/generalSetup/category/category-model";

const router = express.Router();

// Add a new Category module
router.post("/addCategory", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const moduleData = await addCategory(req.body, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Category added successfully.",
      data: moduleData,
    });
  } catch (error: any) {
    await t.rollback();

    if (
      error.name === "SequelizeUniqueConstraintError" &&
      error.errors?.some((e: any) => e.path === "name")
    ) {
      return res.status(409).json({
        success: false,
        message: "This Category is already registered.",
        field: "name",
      });
    }

    console.error("Category add Error:", error);
    return serverError(res, "Something went wrong during Category creation.");
  }
});

// Get all Category modules
router.get("/getAllCategory", async (req, res): Promise<any> => {
  try {
    const modules = await getAllCategorys();
    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("Category getAll Error:", error);
    return serverError(res, "Something went wrong during Category retrieval.");
  }
});

// Get Category module by ID
router.get("/getByCategoryId/:id", async (req, res): Promise<any> => {
  try {
    const moduleData = await getCategoryByID(req.params);
    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Category getById Error:", error);
    return serverError(res, "Something went wrong during Category retrieval.");
  }
});

//update category by id
router.post("/updateCategoryById", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {

    const moduleData = await updateCategory(req.body.id, req.body, t);
    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      data: moduleData,
    });
  } catch (error: any) {
    await t.rollback();

    console.error("Category update Error:", error); 

    if (
      error.name === "SequelizeUniqueConstraintError" &&
      error.errors?.some((e: any) => e.path === "name")
    ) {
      return res.status(409).json({
        success: false,
        message: "This Category is already registered.",
        field: "name",
      });
    }

    return serverError(res, "Something went wrong during Category update.");
  }
});

// Soft delete Category module (isActive = false)
router.get("/removeById/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const moduleData = await deleteCategory(req.params.id, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Category deleted successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Category delete Error:", error);
    await t.rollback();
    return serverError(res, "Something went wrong during Category delete.");
  }
});

export default router;