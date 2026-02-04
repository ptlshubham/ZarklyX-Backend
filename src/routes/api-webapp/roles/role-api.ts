import { Router, Request, Response } from "express";
import dbInstance from "../../../db/core/control-db";
import {
  createRole,
  getRoles,
  getActiveRoles,
  getPlatformRoles,
  getCompanyRoles,
  getRoleById,
  getRoleByName,
  updateRole,
  deleteRole,
  roleNameExists,
  getAvailableRolesForCompany,
  cloneRoleToCompany,
  initializeSystemRoles,
  getSystemRoleByName,
  DEFAULT_SYSTEM_ROLES,
  validateRoleAssignment,
  assignRoleToUser,
} from "../../api-webapp/roles/role-handler";

const router = Router();

// Initialize default system roles
router.post("/initializeSystemRoles", async (req: Request, res: Response) => {
  const t = await dbInstance.transaction();
  try {
    const result = await initializeSystemRoles(t);
    await t.commit();
    
    return res.status(201).json({
      success: true,
      data: result,
      message: `System roles initialized: ${result.created.length} created, ${result.skipped.length} already existed`
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error initializing system roles"
    });
  }
});

// Get default system roles definition
router.get("/getDefaultSystemRoles", async (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: DEFAULT_SYSTEM_ROLES,
    message: "Default system roles definition fetched successfully"
  });
});

// Get a specific system role by name
router.get("/getSystemRole/:name", async (req: Request, res: Response) => {
  let { name } = req.params;
  if(Array.isArray(name)) name = name[0];

  try {
    const role = await getSystemRoleByName(name);
    
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "System role not found"
      });
    }
    
    return res.status(200).json({
      success: true,
      data: role,
      message: "System role fetched successfully"
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching system role"
    });
  }
});

// Create a new role
router.post("/createRole", async (req: Request, res: Response) => {
  const { name, description, scope, companyId, isSystemRole, priority, level, isActive } = req.body;

  if (!name || !scope) {
    return res.status(400).json({ 
      success: false, 
      message: "Name and scope are required" 
    });
  }

  if (!["platform", "company"].includes(scope)) {
    return res.status(400).json({ 
      success: false, 
      message: "Scope must be 'platform' or 'company'" 
    });
  }

  if (scope === "company" && !companyId) {
    return res.status(400).json({ 
      success: false, 
      message: "CompanyId is required for company-scoped roles" 
    });
  }

  // Validate system role constraints
  if (isSystemRole && scope !== "platform") {
    return res.status(400).json({
      success: false,
      message: "System roles must have scope='platform'"
    });
  }

  const t = await dbInstance.transaction();
  try {
    // Check if role name already exists
    const exists = await roleNameExists(name, scope, companyId || null);
    if (exists) {
      await t.rollback();
      return res.status(409).json({ 
        success: false, 
        message: "Role name already exists" 
      });
    }

    const role = await createRole(
      { name, description, scope, companyId, isSystemRole, priority, level, isActive },
      t
    );
    await t.commit();
    return res.status(201).json({ 
      success: true, 
      data: role, 
      message: "Role created successfully" 
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({ 
        success: false, 
        message: `A role with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error creating role" 
    });
  }
});

// Get all roles with optional filters
router.get("/getAllRoles", async (req: Request, res: Response) => {
  try {
    const { scope, companyId, isActive } = req.query;
    
    const filters: any = {};
    if (scope) filters.scope = scope as "platform" | "company";
    if (companyId) filters.companyId = companyId as string;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const roles = await getRoles(filters);
    return res.status(200).json({ 
      success: true, 
      data: roles, 
      message: "Roles fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching roles" 
    });
  }
});

// Get active roles only
router.get("/getActiveRoles", async (req: Request, res: Response) => {
  try {
    const { scope, companyId } = req.query;
    
    const filters: any = {};
    if (scope) filters.scope = scope as "platform" | "company";
    if (companyId) filters.companyId = companyId as string;

    const roles = await getActiveRoles(filters);
    return res.status(200).json({ 
      success: true, 
      data: roles, 
      message: "Active roles fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching active roles" 
    });
  }
});

// Get platform roles
router.get("/getPlatformRoles", async (req: Request, res: Response) => {
  try {
    const roles = await getPlatformRoles();
    return res.status(200).json({ 
      success: true, 
      data: roles, 
      message: "Platform roles fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching platform roles" 
    });
  }
});

// Get company-specific roles
router.get("/getCompanyRoles/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if(Array.isArray(companyId)) companyId = companyId[0];
  
  try {
    const roles = await getCompanyRoles(companyId);
    return res.status(200).json({ 
      success: true, 
      data: roles, 
      message: "Company roles fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching company roles" 
    });
  }
});

// Get available roles for a company (platform + company-specific)
router.get("/getAvailableRoles/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if(Array.isArray(companyId)) companyId = companyId[0];
  
  try {
    const roles = await getAvailableRolesForCompany(companyId);
    return res.status(200).json({ 
      success: true, 
      data: roles, 
      message: "Available roles fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching available roles" 
    });
  }
});

// Get role by ID
router.get("/getRoleById/:id", async (req: Request, res: Response) => {
  let { id } = req.params;
  if(Array.isArray(id)) id = id[0];
  
  try {
    const role = await getRoleById(id);
    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: "Role not found" 
      });
    }
    return res.status(200).json({ 
      success: true, 
      data: role, 
      message: "Role fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching role" 
    });
  }
});

// Get role by name
router.get("/getRoleByName", async (req: Request, res: Response) => {
  const { name, scope, companyId } = req.query;
  
  if (!name || !scope) {
    return res.status(400).json({ 
      success: false, 
      message: "Name and scope are required" 
    });
  }

  try {
    const role = await getRoleByName(
      name as string, 
      scope as "platform" | "company",
      companyId as string | undefined
    );
    
    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: "Role not found" 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      data: role, 
      message: "Role fetched successfully" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error fetching role" 
    });
  }
});

// Update role
router.put("/updateRole/:id", async (req: Request, res: Response) => {
  let { id } = req.params;
  if(Array.isArray(id)) id = id[0];
  const { name, description, isActive } = req.body;

  const t = await dbInstance.transaction();
  try {
    const role = await updateRole(id, { name, description, isActive }, t);
    
    if (!role) {
      await t.rollback();
      return res.status(404).json({ 
        success: false, 
        message: "Role not found" 
      });
    }
    
    await t.commit();
    return res.status(200).json({ 
      success: true, 
      data: role, 
      message: "Role updated successfully" 
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({ 
        success: false, 
        message: `A role with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error updating role" 
    });
  }
});

// Delete role (soft delete)
router.delete("/deleteRole/:id", async (req: Request, res: Response) => {
  let { id } = req.params;
  if(Array.isArray(id)) id = id[0];

  const t = await dbInstance.transaction();
  try {
    const deleted = await deleteRole(id, t);
    
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ 
        success: false, 
        message: "Role not found" 
      });
    }
    
    await t.commit();
    return res.status(200).json({ 
      success: true, 
      data: null, 
      message: "Role deleted successfully" 
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error deleting role" 
    });
  }
});

// Clone a platform role to company-specific role
router.post("/cloneRole", async (req: Request, res: Response) => {
  const { platformRoleId, companyId, newName, newDescription, permissionIds } = req.body;

  if (!platformRoleId || !companyId) {
    return res.status(400).json({ 
      success: false, 
      message: "PlatformRoleId and companyId are required" 
    });
  }

  // Validate permissionIds if provided
  if (permissionIds !== undefined && !Array.isArray(permissionIds)) {
    return res.status(400).json({
      success: false,
      message: "permissionIds must be an array"
    });
  }

  const t = await dbInstance.transaction();
  try {
    const role = await cloneRoleToCompany(
      platformRoleId, 
      companyId, 
      newName, 
      newDescription, 
      permissionIds,
      t
    );
    await t.commit();
    return res.status(201).json({ 
      success: true, 
      data: role, 
      message: "Role cloned successfully" 
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({ 
        success: false, 
        message: `A role with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error cloning role" 
    });
  }
});

// Check if role name exists
router.get("/checkRoleName", async (req: Request, res: Response) => {
  const { name, scope, companyId, excludeRoleId } = req.query;

  if (!name || !scope) {
    return res.status(400).json({ 
      success: false, 
      message: "Name and scope are required" 
    });
  }

  try {
    const exists = await roleNameExists(
      name as string,
      scope as "platform" | "company",
      companyId as string | undefined,
      excludeRoleId as string | undefined
    );
    
    return res.status(200).json({ 
      success: true, 
      data: { exists }, 
      message: exists ? "Role name already exists" : "Role name is available" 
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error checking role name" 
    });
  }
});

// Validate if a role can be assigned to a user
router.post("/validateRoleAssignment", async (req: Request, res: Response) => {
  const { userId, roleId } = req.body;

  if (!userId || !roleId) {
    return res.status(400).json({
      success: false,
      message: "userId and roleId are required"
    });
  }

  try {
    const validation = await validateRoleAssignment(userId, roleId);
    
    return res.status(200).json({
      success: validation.valid,
      data: { valid: validation.valid, error: validation.error },
      message: validation.valid ? "Role assignment is valid" : validation.error
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error validating role assignment"
    });
  }
});

// Assign a role to a user with validation
router.post("/assignRoleToUser", async (req: Request, res: Response) => {
  const { userId, roleId } = req.body;

  if (!userId || !roleId) {
    return res.status(400).json({
      success: false,
      message: "userId and roleId are required"
    });
  }

  const t = await dbInstance.transaction();
  try {
    const result = await assignRoleToUser(userId, roleId, t);
    
    if (!result.success) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error assigning role to user"
    });
  }
});

export default router;
