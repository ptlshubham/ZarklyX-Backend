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
      message: "Category module added successfully.",
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
        message: "This Category module name is already registered.",
        field: "name",
      });
    }

    console.error("Category add Error:", error);
    return serverError(res, "Something went wrong during Category module creation.");
  }
});

// Get all Category modules
router.get("/getAllCategory", async (req, res): Promise<any> => {
  try {
    const modules = await getAllCategorys();
    return res.status(200).json({
      success: true,
      message: "Category modules retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("Category getAll Error:", error);
    return serverError(res, "Something went wrong during Category modules retrieval.");
  }
});

// Get Category module by ID
router.get("/getByCategoryId/:id", async (req, res): Promise<any> => {
  try {
    const moduleData = await getCategoryByID(req.params);
    return res.status(200).json({
      success: true,
      message: "Category module retrieved successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Category getById Error:", error);
    return serverError(res, "Something went wrong during Category module retrieval.");
  }
});

// Update Category module
// router.post("/updateCategoryById/:id", async (req, res): Promise<any> => {
//   const t = await dbInstance.transaction();
//   try {
//     const moduleData = await updateCategory(Number(req.body.id), req.body, t);
//     await t.commit();
//     return res.status(200).json({
//       success: true,
//       message: "Category module updated successfully.",
//       data: moduleData,
//     });
//   } catch (error: any) {
//     await t.rollback();

//     if (
//       error.name === "SequelizeUniqueConstraintError" &&
//       error.errors?.some((e: any) => e.path === "name")
//     ) {
//       return res.status(409).json({
//         success: false,
//         message: "This Category module name is already registered.",
//         field: "name",
//       });
//     }

//     console.error("Category update Error:", error);
//     return serverError(res, "Something went wrong during Category module update.");
//   }
// });
router.post("/updateCategoryById", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {

    const moduleData = await updateCategory(req.body.id, req.body, t);
    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Category module updated successfully.",
      data: moduleData,
    });
  } catch (error: any) {
    await t.rollback();

    console.error("Category update Error:", error); // <- watch your terminal!

    if (
      error.name === "SequelizeUniqueConstraintError" &&
      error.errors?.some((e: any) => e.path === "name")
    ) {
      return res.status(409).json({
        success: false,
        message: "This Category module name is already registered.",
        field: "name",
      });
    }

    return serverError(res, "Something went wrong during Category module update.");
  }
});

// router.post("/updateCategoryById/:id", async (req, res): Promise<any> => {
//   const t = await dbInstance.transaction();
//   try {
//     const id = Number(req.params.id); 

//     const moduleData = await updateCategory(id, req.body, t);
//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Category module updated successfully.",
//       data: moduleData,
//     });
//   } catch (error: any) {
//     await t.rollback();

//     if (
//       error.name === "SequelizeUniqueConstraintError" &&
//       error.errors?.some((e: any) => e.path === "name")
//     ) {
//       return res.status(409).json({
//         success: false,
//         message: "This Category module name is already registered.",
//         field: "name",
//       });
//     }

//     console.error("Category update Error:", error);
//     return serverError(res, "Something went wrong during Category module update.");
//   }
// });


// Soft delete Category module (isActive = false)
router.get("/removeById/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const moduleData = await deleteCategory(Number(req.params.id), t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Category module deleted successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Category delete Error:", error);
    await t.rollback();
    return serverError(res, "Something went wrong during Category module delete.");
  }
});

export default router;