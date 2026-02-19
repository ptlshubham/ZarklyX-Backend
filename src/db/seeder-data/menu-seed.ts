import { Sequelize } from "sequelize";
import * as fs from "fs";
import * as path from "path";
import { Modules } from "../../routes/api-webapp/superAdmin/modules/modules-model";
import { Permissions } from "../../routes/api-webapp/superAdmin/permissions/permissions-model";

interface MenuItem {
  id: number;
  label: string;
  subItems?: MenuItem[];
  parentId?: number;
}

interface ModulePermissionMap {
  moduleName: string;
  moduleDescription: string;
  permissions: {
    name: string;
    description: string;
    displayName: string;
    action: string;
  }[];
  subModules?: ModulePermissionMap[];
}

/**
 * Load menu data from JSON file
 */
function loadMenuFromJSON(fileName: string): MenuItem[] {
  try {
    // Use process.cwd() to get project root, then navigate to src/routes/api-webapp
    // This works whether running from src or compiled dist
    const menuPath = path.join(process.cwd(), "src", "routes", "api-webapp", fileName);
    
    // Check if file exists
    if (!fs.existsSync(menuPath)) {
      console.warn(`Menu file not found: ${fileName}`);
      return [];
    }
    
    let menuContent = fs.readFileSync(menuPath, "utf-8");
    
    // Strip UTF-8 BOM if present (EF BB BF)
    if (menuContent.charCodeAt(0) === 0xFEFF) {
      menuContent = menuContent.substring(1);
    }
    
    const parsed = JSON.parse(menuContent);
    
    return parsed;
  } catch (error: any) {
    console.error(` Error loading ${fileName}:`, error.message);
    return [];
  }
}

/**
 * Extracts module and permission data from menu items
 * Handles nested subItems as submodules
 */
function extractModulesFromMenu(
  menuItems: MenuItem[]
): ModulePermissionMap[] {
  const modules: ModulePermissionMap[] = [];

  for (const item of menuItems) {
    const moduleName = item.label;

    // Create module entry for ALL items (including section headers)
    const moduleData: ModulePermissionMap = {
      moduleName: moduleName,
      moduleDescription: `${moduleName} module - Manage ${moduleName.toLowerCase()} functionality`,
      permissions: [],
      subModules: [],
    };

    // Generate CRUD + Manage permissions for this module
    // Format: resource.action (e.g., client_management.view)
    const resource = moduleName.replace(/\s+/g, "_").toLowerCase();

    moduleData.permissions.push(
      {
        name: `${resource}.view`,
        description: `View ${moduleName}`,
        displayName: `View ${moduleName}`,
        action: "view",
      },
      {
        name: `${resource}.create`,
        description: `Create ${moduleName}`,
        displayName: `Create ${moduleName}`,
        action: "create",
      },
      {
        name: `${resource}.update`,
        description: `Update ${moduleName}`,
        displayName: `Update ${moduleName}`,
        action: "update",
      },
      {
        name: `${resource}.delete`,
        description: `Delete ${moduleName}`,
        displayName: `Delete ${moduleName}`,
        action: "delete",
      },
      {
        name: `${resource}.manage`,
        description: `Full management access to ${moduleName} (includes create, update, delete)`,
        displayName: `Manage ${moduleName}`,
        action: "manage",
      }
    );

    // Process subItems recursively (if they exist)
    if (item.subItems && item.subItems.length > 0) {
      const subModules = extractModulesFromMenu(item.subItems);

      if (subModules.length > 0) {
        moduleData.subModules = subModules;
      }
    }

    modules.push(moduleData);
  }

  return modules;
}

/**
 * Recursively seeds modules and their permissions
 * Returns the created module ID
 * 
 * @param moduleData - Module data to seed
 * @param sequelize - Sequelize instance
 * @param parentModuleId - Parent module ID for hierarchical structure (NULL for root)
 */
async function seedModuleRecursive(
  moduleData: ModulePermissionMap,
  sequelize: Sequelize,
  parentModuleId?: string
): Promise<string> {
  // Check if module already exists
  let module = await Modules.findOne({
    where: { name: moduleData.moduleName },
  });

  if (!module) {
    // Create the module with parent relationship
    module = await Modules.create({
      name: moduleData.moduleName,
      description: moduleData.moduleDescription,
      parentModuleId: parentModuleId || null, // Set parent or NULL for root
      price: 0,
      isFreeForAll: false,
      isActive: true,
      isDeleted: false,
    });
    
    // ...existing code...
  } else {
    // Update parentModuleId if module exists but parent changed
    if (module.parentModuleId !== (parentModuleId || null)) {
      await module.update({ parentModuleId: parentModuleId || null });
    }
  }

  // Seed permissions for this module
  for (const permData of moduleData.permissions) {
    const existingPermission = await Permissions.findOne({
      where: { name: permData.name },
    });

    if (!existingPermission) {
      await Permissions.create({
        name: permData.name,
        description: permData.description,
        displayName: permData.displayName,
        moduleId: module.id,
        action: permData.action,
        price: 0,
        isSystemPermission: false,
        isSubscriptionExempt: false,
        isFreeForAll: false,
        isActive: true,
        isDeleted: false,
      });
    }
  }

  // Recursively seed submodules
  if (moduleData.subModules && moduleData.subModules.length > 0) {
    for (const subModule of moduleData.subModules) {
      await seedModuleRecursive(subModule, sequelize, module.id);
    }
  }

  return module.id;
}

/**
 * Main seeding function for modules and permissions
 * Automatically extracts and seeds from menu configurations
 */
export async function seedModulesAndPermissions(sequelize: Sequelize) {

  try {
    // Check if required tables exist
    const qi = sequelize.getQueryInterface();
    const tables = await qi.showAllTables();

    if (!tables.includes("modules") || !tables.includes("permissions")) {
      console.log(
        "Required tables (modules/permissions) don't exist yet, skipping menu seeding"
      );
      return;
    }

    // Load menus from JSON files (with error handling)
    const agencyMenu = loadMenuFromJSON("agency.menu.json");
    const agencyClientMenu = loadMenuFromJSON("agency-client.menu.json");
    const agencyEmployeeMenu = loadMenuFromJSON("agency-employee.menu.json");

    // Check if all menus are empty (files not found or invalid)
    if (agencyMenu.length === 0 && agencyClientMenu.length === 0 && agencyEmployeeMenu.length === 0) {
      return;
    }

    // Extract modules from all menu configurations
    const agencyModules = extractModulesFromMenu(agencyMenu);
    const clientModules = extractModulesFromMenu(agencyClientMenu);
    const employeeModules = extractModulesFromMenu(agencyEmployeeMenu);

    // Combine all modules (use a Map to avoid duplicates by name)
    const allModulesMap = new Map<string, ModulePermissionMap>();

    [...agencyModules, ...clientModules, ...employeeModules].forEach((mod) => {
      if (!allModulesMap.has(mod.moduleName)) {
        allModulesMap.set(mod.moduleName, mod);
      } else {
        // If module exists, merge permissions
        const existingMod = allModulesMap.get(mod.moduleName)!;
        const existingPermNames = new Set(
          existingMod.permissions.map((p) => p.name)
        );

        mod.permissions.forEach((perm) => {
          if (!existingPermNames.has(perm.name)) {
            existingMod.permissions.push(perm);
          }
        });

        // Merge submodules
        if (mod.subModules && mod.subModules.length > 0) {
          if (!existingMod.subModules) {
            existingMod.subModules = [];
          }
          existingMod.subModules.push(...mod.subModules);
        }
      }
    });

    const allModules = Array.from(allModulesMap.values());


    // Seed all modules and their permissions
    for (const moduleData of allModules) {
      await seedModuleRecursive(moduleData, sequelize);
    }
  } catch (error) {
    console.error("Error seeding modules and permissions:", error);
    throw error;
  }
}
