import express from "express";
import dbInstance from "../../../../../db/core/control-db";
import { serverError } from "../../../../../utils/responseHandler";
import { tokenMiddleWare } from "../../../../../services/jwtToken-service";


import {
  addPremiumModule,
  getPremiumModuleByID,
  getAllPremiumModules,
  updatePremiumModule,
  deletePremiumModule,
} from "./premiumModule-handler";
import { PremiumModule } from "../../../superAdmin/generalSetup/premiumModule/premiumModule-model";

const router = express.Router();

// Add a new premium module
router.post("/addPremiumModule", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const moduleData = await addPremiumModule(req.body, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Premium module added successfully.",
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
        message: "This premium module name is already registered.",
        field: "name",
      });
    }

    console.error("PremiumModule add Error:", error);
    return serverError(res, "Something went wrong during premium module creation.");
  }
});

// Get all premium modules
router.get("/getAllPremiumModule", async (req, res): Promise<any> => {
  try {
    const modules = await getAllPremiumModules();
    return res.status(200).json({
      success: true,
      message: "Premium modules retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("PremiumModule getAll Error:", error);
    return serverError(res, "Something went wrong during premium modules retrieval.");
  }
});

// Get premium module by ID
router.get("/getByPremiumModuleId/:id", async (req, res): Promise<any> => {
  try {
    const moduleData = await getPremiumModuleByID(req.params);
    return res.status(200).json({
      success: true,
      message: "Premium module retrieved successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("PremiumModule getById Error:", error);
    return serverError(res, "Something went wrong during premium module retrieval.");
  }
});

// Update premium module
router.post("/updatePremiumModuleById/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const id = Number(req.params.id); 

    const moduleData = await updatePremiumModule(id, req.body, t);
    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Premium module updated successfully.",
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
        message: "This Premium module name is already registered.",
        field: "name",
      });
    }

    console.error("Premium update Error:", error);
    return serverError(res, "Something went wrong during Premium module update.");
  }
});
// router.post("/updatePremiumModuleById/:Id", async (req, res): Promise<any> => {
//   const t = await dbInstance.transaction();
//   try {
//     const moduleData = await updatePremiumModule(Number(req.body.id), req.body, t);
//     await t.commit();
//     return res.status(200).json({
//       success: true,
//       message: "Premium module updated successfully.",
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
//         message: "This premium module name is already registered.",
//         field: "name",
//       });
//     }

//     console.error("PremiumModule update Error:", error);
//     return serverError(res, "Something went wrong during premium module update.");
//   }
// });

// Soft delete premium module (isActive = false)
router.get("/removeById/:id", tokenMiddleWare, async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const moduleData = await deletePremiumModule(Number(req.params.id), t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Premium module deleted successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("PremiumModule delete Error:", error);
    await t.rollback();
    return serverError(res, "Something went wrong during premium module delete.");
  }
});

export default router;