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
      message: "Premium added successfully.",
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
        message: "This premium name is already registered.",
        field: "name",
      });
    }

    console.error("PremiumModule add Error:", error);
    return serverError(res, "Something went wrong during premium creation.");
  }
});

// Get all premium modules
router.get("/getAllPremiumModule", async (req, res): Promise<any> => {
  try {
    const modules = await getAllPremiumModules();
    return res.status(200).json({
      success: true,
      message: "Premium retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("PremiumModule getAll Error:", error);
    return serverError(res, "Something went wrong during premium retrieval.");
  }
});

// Get premium module by ID
router.get("/getByPremiumModuleId/:id", async (req, res): Promise<any> => {
  try {
    const moduleData = await getPremiumModuleByID(req.params);
    return res.status(200).json({
      success: true,
      message: "Premium retrieved successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("PremiumModule getById Error:", error);
    return serverError(res, "Something went wrong during premium retrieval.");
  }
});

// Update premium module
router.post("/updatePremiumModuleById", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const id = Number(req.body.id); 

    const moduleData = await updatePremiumModule(id, req.body, t);
    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Premium updated successfully.",
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
        message: "This Premium is already registered.",
        field: "name",
      });
    }

    console.error("Premium update Error:", error);
    return serverError(res, "Something went wrong during Premium update.");
  }
});

// Soft delete premium module (isActive = false)
router.get("/removeById/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const moduleData = await deletePremiumModule(Number(req.params.id), t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Premium deleted successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Premium delete Error:", error);
    await t.rollback();
    return serverError(res, "Something went wrong during premium delete.");
  }
});

export default router;