import { Router, Request, Response } from "express";
import dbInstance from "../../../../db/core/control-db"
import {
  createCompanyModule,
  bulkCreateCompanyModules,
  getCompanyModules,
  getActiveCompanyModules,
  getCompanyModuleById,
  getModulesByCompanyId,
  checkCompanyModuleAccess,
  updateCompanyModule,
  deleteCompanyModule,
  disableAllCompanyModules,
} from "../../../api-webapp/company/company-module/company-module-handler";

const router = Router();

// Create a new company module mapping
router.post("/createCompanyModule", async (req: Request, res: Response) => {
  const { companyId, moduleId, source, price, isActive, isDeleted } = req.body;

  if (!companyId || !moduleId) {
    return res.status(400).json({ success: false, message: "Company ID and Module ID are required" });
  }

  // Validate source if provided
  if (source && !['plan', 'addon'].includes(source)) {
    return res.status(400).json({ success: false, message: "source must be 'plan' or 'addon'" });
  }

  // Validate price if provided
  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ success: false, message: "price must be a non-negative number" });
  }

  const t = await dbInstance.transaction();
  try {
    const companyModule = await createCompanyModule(
      { companyId, moduleId, source: source || 'addon', price: price || 0, isActive, isDeleted },
      t
    );
    await t.commit();
    return res.status(201).json({ success: true, data: companyModule, message: "Company module created successfully" });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        success: false, 
        message: "This module is already assigned to the company" 
      });
    }
    return res.status(500).json({ success: false, message: error.message || "Error creating company module" });
  }
});

// Bulk create company modules (for subscription plan modules or addon purchases)
router.post("/bulkCreateCompanyModule", async (req: Request, res: Response) => {
  const { companyId, modules } = req.body;

  if (!companyId || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({ success: false, message: "Company ID and array of modules are required" });
  }

  // Validate each module object
  for (const module of modules) {
    if (!module.moduleId) {
      return res.status(400).json({ success: false, message: "Each module must have a moduleId" });
    }
    if (module.source && !['plan', 'addon'].includes(module.source)) {
      return res.status(400).json({ success: false, message: "source must be 'plan' or 'addon'" });
    }
    if (module.price !== undefined && (typeof module.price !== 'number' || module.price < 0)) {
      return res.status(400).json({ success: false, message: "price must be a non-negative number" });
    }
  }

  const t = await dbInstance.transaction();
  try {
    const companyModules = await bulkCreateCompanyModules(companyId, modules, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      data: companyModules,
      message: `${companyModules.length} company modules created successfully`
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message || "Error creating company modules" });
  }
});

// Get all company modules
router.get("/getAllCompanyModule", async (req: Request, res: Response) => {
  try {
    const companyModules = await getCompanyModules();
    return res.status(200).json({ success: true, data: companyModules, message: "Company modules fetched successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error fetching company modules" });
  }
});

// Get active company modules
router.get("/getActiveCompanyModule", async (req: Request, res: Response) => {
  try {
    const activeCompanyModules = await getActiveCompanyModules();
    return res.status(200).json({ success: true, data: activeCompanyModules, message: "Active company modules fetched successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error fetching active company modules" });
  }
});

// Get company module by ID
router.get("/getCompanyModuleById/:id", async (req: Request, res: Response) => {
  let { id } = req.params;
  if(Array.isArray(id)) id = id[0];
  try {
    const companyModule = await getCompanyModuleById(id);
    if (!companyModule) {
      return res.status(404).json({ success: false, message: "Company module not found" });
    }
    return res.status(200).json({ success: true, data: companyModule, message: "Company module fetched successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error fetching company module" });
  }
});

// Get all modules for a specific company
router.get("/getCompanyModuleByCompanyId/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if(Array.isArray(companyId)) companyId = companyId[0];
  try {
    const companyModules = await getModulesByCompanyId(companyId);
    return res.status(200).json({ success: true, data: companyModules, message: "Company modules fetched successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error fetching company modules" });
  }
});

// Check if company has access to a specific module
router.get("/check-access-CompanyModule/:companyId/:moduleId", async (req: Request, res: Response) => {
  let { companyId, moduleId } = req.params;
  if(Array.isArray(companyId)) companyId = companyId[0];
  if(Array.isArray(moduleId)) moduleId = moduleId[0];
  try {
    const hasAccess = await checkCompanyModuleAccess(companyId, moduleId);
    return res.status(200).json({
      success: true,
      data: { hasAccess },
      message: hasAccess ? "Company has access to this module" : "Company does not have access to this module"
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error checking module access" });
  }
});

// Update company module
router.put("/updateCompanyModule/:id", async (req: Request, res: Response) => {
  let { id } = req.params;
  if(Array.isArray(id)) id = id[0];
  const updateFields = req.body;

  const t = await dbInstance.transaction();
  try {
    const updated = await updateCompanyModule(id, updateFields, t);
    await t.commit();
    if (!updated) {
      return res.status(404).json({ success: false, message: "Company module not found or not updated" });
    }
    return res.status(200).json({ success: true, data: null, message: "Company module updated successfully" });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        success: false, 
        message: "This module is already assigned to the company" 
      });
    }
    return res.status(500).json({ success: false, message: error.message || "Error updating company module" });
  }
});

// Delete company module (soft delete)
router.delete("/deleteCompanyModule/:id", async (req: Request, res: Response) => {
  let { id } = req.params;
  if(Array.isArray(id)) id = id[0];

  const t = await dbInstance.transaction();
  try {
    const deleted = await deleteCompanyModule(id, t);
    await t.commit();
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Company module not found or already deleted" });
    }
    return res.status(200).json({ success: true, data: null, message: "Company module deleted successfully" });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message || "Error deleting company module" });
  }
});

// Disable all modules for a company (when subscription expires)
router.put("/disable-allCompanyModule/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if(Array.isArray(companyId)) companyId = companyId[0];

  const t = await dbInstance.transaction();
  try {
    await disableAllCompanyModules(companyId, t);
    await t.commit();
    return res.status(200).json({ success: true, data: null, message: "All company modules disabled successfully" });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message || "Error disabling company modules" });
  }
});

export default router;
