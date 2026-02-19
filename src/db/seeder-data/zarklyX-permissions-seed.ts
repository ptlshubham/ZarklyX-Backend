import { Sequelize } from "sequelize";
import * as fs from "fs";
import * as path from "path";
import { Modules } from "../../routes/api-webapp/superAdmin/modules/modules-model";
import { ZarklyXPermission } from "../../routes/api-webapp/superAdmin/rbac/permissions/permissions-model";

interface MenuItem {
  id: number;
  label: string;
  subItems?: MenuItem[];
  parentId?: number;
}

interface ZarklyXModulePermissionMap {
  moduleName: string;
  moduleDescription: string;
  permissions: {
    name: string;
    description: string;
    displayName: string;
    action: string;
    isSystemPermission?: boolean;
  }[];
  subModules?: ZarklyXModulePermissionMap[];
}

/**
 * Load menu data from JSON file
 */
function loadMenuFromJSON(fileName: string): MenuItem[] {
  try {
    const menuPath = path.join(process.cwd(), "src", "routes", "api-webapp", fileName);
    
    if (!fs.existsSync(menuPath)) {
      console.warn(`Menu file not found: ${fileName}`);
      return [];
    }
    
    let menuContent = fs.readFileSync(menuPath, "utf-8");
    
    // Strip UTF-8 BOM if present
    if (menuContent.charCodeAt(0) === 0xFEFF) {
      menuContent = menuContent.substring(1);
    }
    
    return JSON.parse(menuContent);
  } catch (error: any) {
    console.error(`Error loading ${fileName}:`, error.message);
    return [];
  }
}

/**
 * Extracts module and permission data from menu items for ZarklyX
 * Similar to menu-seed.ts but creates permissions for ZarklyX users
 */
function extractZarklyXModulesFromMenu(
  menuItems: MenuItem[],
  parentPath: string[] = []
): ZarklyXModulePermissionMap[] {
  const modules: ZarklyXModulePermissionMap[] = [];

  for (const item of menuItems) {
    const moduleName = item.label;

    const moduleData: ZarklyXModulePermissionMap = {
      moduleName: moduleName,
      moduleDescription: `${moduleName} module - Manage ${moduleName.toLowerCase()} functionality`,
      permissions: [],
      subModules: [],
    };

    // Generate CRUD + Manage permissions for this module
    const currentModulePart = moduleName.replace(/\s+/g, "_").toLowerCase();
    const fullPath = [...parentPath, currentModulePart];
    const permissionPrefix = fullPath.join(".");

    moduleData.permissions.push(
      {
        name: `${permissionPrefix}.view`,
        description: `View ${moduleName}`,
        displayName: `View ${moduleName}`,
        action: "view",
      },
      {
        name: `${permissionPrefix}.create`,
        description: `Create ${moduleName}`,
        displayName: `Create ${moduleName}`,
        action: "create",
      },
      {
        name: `${permissionPrefix}.update`,
        description: `Update ${moduleName}`,
        displayName: `Update ${moduleName}`,
        action: "update",
      },
      {
        name: `${permissionPrefix}.delete`,
        description: `Delete ${moduleName}`,
        displayName: `Delete ${moduleName}`,
        action: "delete",
      },
      {
        name: `${permissionPrefix}.manage`,
        description: `Full management access to ${moduleName} (includes create, update, delete)`,
        displayName: `Manage ${moduleName}`,
        action: "manage",
      }
    );

    // Process subItems recursively
    if (item.subItems && item.subItems.length > 0) {
      const subModules = extractZarklyXModulesFromMenu(item.subItems, fullPath);
      if (subModules.length > 0) {
        moduleData.subModules = subModules;
      }
    }

    modules.push(moduleData);
  }

  return modules;
}

/**
 * Seed ZarklyX platform permissions (recursive)
 */
async function seedZarklyXModulePermissions(
  moduleData: ZarklyXModulePermissionMap,
  sequelize: Sequelize,
  parentModuleId?: string
): Promise<string> {
  // Check if module exists, create if not
  let module = await Modules.findOne({
    where: { 
      name: moduleData.moduleName,
      parentModuleId: parentModuleId || null
    },
  });

  if (!module) {
    module = await Modules.create({
      name: moduleData.moduleName,
      description: moduleData.moduleDescription,
      parentModuleId: parentModuleId || null,
      price: 0,
      isFreeForAll: true, // ZarklyX platform modules are typically free for all
      isActive: true,
      isDeleted: false,
    });
    console.log(`✓ Created ZarklyX module: ${moduleData.moduleName}`);
  }

  // Seed permissions for this module
  for (const permData of moduleData.permissions) {
    const existingPermission = await ZarklyXPermission.findOne({
      where: { name: permData.name },
    });

    if (!existingPermission) {
      await ZarklyXPermission.create({
        name: permData.name,
        description: permData.description,
        displayName: permData.displayName,
        moduleId: module.id,
        action: permData.action,
        isSystemPermission: permData.isSystemPermission || false,
        isActive: true,
        isDeleted: false,
      });
      console.log(`  ✓ Created ZarklyX permission: ${permData.name}`);
    }
  }

  // Recursively seed submodules
  if (moduleData.subModules && moduleData.subModules.length > 0) {
    for (const subModule of moduleData.subModules) {
      await seedZarklyXModulePermissions(subModule, sequelize, module.id);
    }
  }

  return module.id;
}

/**
 * Main seeding function for ZarklyX permissions
 */
export async function seedZarklyXPermissions(sequelize: Sequelize) {
  try {
    console.log("\n=== Seeding ZarklyX Platform Permissions ===\n");

    // Check if required tables exist
    const qi = sequelize.getQueryInterface();
    const tables = await qi.showAllTables();
    const tableNames = tables.map((t: string) => t.toLowerCase());

    if (!tableNames.includes("modules") && !tableNames.includes("zarklyxmodules")) {
      console.log(
        "Required tables (modules) don't exist yet, skipping ZarklyX permission seeding"
      );
      return;
    }

    if (!tableNames.includes("zarklyx_permissions") && !tableNames.includes("zarklyxpermissions")) {
      console.log(
        "Required tables (zarklyX_permissions) don't exist yet, skipping ZarklyX permission seeding"
      );
      return;
    }

    // Define ZarklyX platform modules and their permissions
    const zarklyXModules: ZarklyXModulePermissionMap[] = [
      {
        moduleName: "Users",
        moduleDescription: "User management module - Manage platform users",
        permissions: [
          {
            name: "platform.users.view",
            description: "View users",
            displayName: "View Users",
            action: "view",
          },
          {
            name: "platform.users.create",
            description: "Create new users",
            displayName: "Create Users",
            action: "create",
          },
          {
            name: "platform.users.update",
            description: "Update user information",
            displayName: "Update Users",
            action: "update",
          },
          {
            name: "platform.users.delete",
            description: "Delete users",
            displayName: "Delete Users",
            action: "delete",
            isSystemPermission: true,
          },
          {
            name: "platform.users.manage",
            description: "Full management access to users",
            displayName: "Manage Users",
            action: "manage",
            isSystemPermission: true,
          },
        ],
      },
      {
        moduleName: "Roles",
        moduleDescription: "Role management module - Manage platform roles",
        permissions: [
          {
            name: "platform.roles.view",
            description: "View roles",
            displayName: "View Roles",
            action: "view",
          },
          {
            name: "platform.roles.create",
            description: "Create new roles",
            displayName: "Create Roles",
            action: "create",
          },
          {
            name: "platform.roles.update",
            description: "Update role information",
            displayName: "Update Roles",
            action: "update",
          },
          {
            name: "platform.roles.delete",
            description: "Delete roles",
            displayName: "Delete Roles",
            action: "delete",
            isSystemPermission: true,
          },
          {
            name: "platform.roles.manage",
            description: "Full management access to roles",
            displayName: "Manage Roles",
            action: "manage",
            isSystemPermission: true,
          },
        ],
      },
      {
        moduleName: "Permissions",
        moduleDescription: "Permission management module - Manage platform permissions",
        permissions: [
          {
            name: "platform.permissions.view",
            description: "View permissions",
            displayName: "View Permissions",
            action: "view",
          },
          {
            name: "platform.permissions.create",
            description: "Create new permissions",
            displayName: "Create Permissions",
            action: "create",
          },
          {
            name: "platform.permissions.update",
            description: "Update permission information",
            displayName: "Update Permissions",
            action: "update",
          },
          {
            name: "platform.permissions.delete",
            description: "Delete permissions",
            displayName: "Delete Permissions",
            action: "delete",
            isSystemPermission: true,
          },
          {
            name: "platform.permissions.manage",
            description: "Full management access to permissions",
            displayName: "Manage Permissions",
            action: "manage",
            isSystemPermission: true,
          },
        ],
      },
      {
        moduleName: "Companies",
        moduleDescription: "Company management module - Manage platform companies",
        permissions: [
          {
            name: "platform.companies.view",
            description: "View companies",
            displayName: "View Companies",
            action: "view",
          },
          {
            name: "platform.companies.create",
            description: "Create new companies",
            displayName: "Create Companies",
            action: "create",
          },
          {
            name: "platform.companies.update",
            description: "Update company information",
            displayName: "Update Companies",
            action: "update",
          },
          {
            name: "platform.companies.delete",
            description: "Delete companies",
            displayName: "Delete Companies",
            action: "delete",
            isSystemPermission: true,
          },
          {
            name: "platform.companies.manage",
            description: "Full management access to companies",
            displayName: "Manage Companies",
            action: "manage",
            isSystemPermission: true,
          },
        ],
      },
      {
        moduleName: "Modules",
        moduleDescription: "Module management - Manage platform feature modules",
        permissions: [
          {
            name: "platform.modules.view",
            description: "View modules",
            displayName: "View Modules",
            action: "view",
          },
          {
            name: "platform.modules.create",
            description: "Create new modules",
            displayName: "Create Modules",
            action: "create",
          },
          {
            name: "platform.modules.update",
            description: "Update module information",
            displayName: "Update Modules",
            action: "update",
          },
          {
            name: "platform.modules.delete",
            description: "Delete modules",
            displayName: "Delete Modules",
            action: "delete",
            isSystemPermission: true,
          },
          {
            name: "platform.modules.manage",
            description: "Full management access to modules",
            displayName: "Manage Modules",
            action: "manage",
            isSystemPermission: true,
          },
        ],
      },
      {
        moduleName: "Subscription Plans",
        moduleDescription: "Subscription plan management - Manage platform subscription plans",
        permissions: [
          {
            name: "platform.subscription_plans.view",
            description: "View subscription plans",
            displayName: "View Subscription Plans",
            action: "view",
          },
          {
            name: "platform.subscription_plans.create",
            description: "Create new subscription plans",
            displayName: "Create Subscription Plans",
            action: "create",
          },
          {
            name: "platform.subscription_plans.update",
            description: "Update subscription plan information",
            displayName: "Update Subscription Plans",
            action: "update",
          },
          {
            name: "platform.subscription_plans.delete",
            description: "Delete subscription plans",
            displayName: "Delete Subscription Plans",
            action: "delete",
          },
          {
            name: "platform.subscription_plans.manage",
            description: "Full management access to subscription plans",
            displayName: "Manage Subscription Plans",
            action: "manage",
          },
        ],
      },
    ];

    // Seed all ZarklyX modules and permissions
    console.log("Seeding platform-specific permissions...\n");
    for (const moduleData of zarklyXModules) {
      await seedZarklyXModulePermissions(moduleData, sequelize);
    }

    // ============================================================
    // Load and seed permissions from agency.menu.json
    // ============================================================
    console.log("\nSeeding agency menu permissions for ZarklyX users...\n");
    
    const agencyMenu = loadMenuFromJSON("agency.menu.json");
    
    if (agencyMenu.length > 0) {
      // Extract modules from agency menu
      const agencyModules = extractZarklyXModulesFromMenu(agencyMenu);
      
      // Seed all agency modules and permissions for ZarklyX
      for (const moduleData of agencyModules) {
        await seedZarklyXModulePermissions(moduleData, sequelize);
      }
      
      console.log(`✓ Seeded ${agencyModules.length} agency modules for ZarklyX users\n`);
    } else {
      console.warn("⚠ No agency menu found, skipping agency permissions\n");
    }

    console.log("✓ ZarklyX permissions seeded successfully!\n");
  } catch (error) {
    console.error("Error seeding ZarklyX permissions:", error);
    throw error;
  }
}
