import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";

// Create a new module
export const createModule = async (name: string, description: string, price: number, isFreeForAll: boolean, t: any) => {
    return await Modules.create(
        {
            name,
            description,
            price: price || 0.00,
            isFreeForAll: isFreeForAll || false,
            isActive: true,
            isDeleted: false
        },
        { transaction: t }
    );
};

// Get all modules
export const getModules = async () => {
    return await Modules.findAll();
};

// Get module by ID
export const getModuleById = async (id: string) => {
    return await Modules.findByPk(id);
};

// Get all active modules
export const getActiveModules = async () => {
    const modules = await Modules.findAll({
        where: { isActive: true, isDeleted: false }
    });
    return modules;
};

// Update module
export const updateModule = async (id: string, body: any, t: any) => {
    const module = await Modules.findByPk(body.id);
    if (!module) return null;
    await Modules.update(
        {
            ...body,
        },
        {
            where: { id: body.id },
            transaction: t,
        }
    );
    await module.reload();
    return module;
};

// Delete module
export const deleteModule = async (id: string, t: any) => {
    const module = await Modules.findByPk(id);
    if (!module) return false;
    await Modules.update(
        {
            isActive: false,
            isDeleted: true,
        },
        {
            where: { id },
            transaction: t,
        }
    );
    return true;
};

// Toggle module active status
export const toggleModuleActive = async (id: string, t: any) => {
    const module = await Modules.findByPk(id);
    if (!module) return null;
    module.isActive = !module.isActive;
    await module.save({ transaction: t });
    return module;
};

// Get all modules with their permissions
export const getModulesWithPermissions = async () => {
    return await Modules.findAll({
        include: [
            {
                model: Permissions,
                as: "permissions",
                where: { isDeleted: false },
                required: false,
                attributes: ["id", "name", "description", "action", "price", "isSystemPermission", "isSubscriptionExempt", "isFreeForAll", "isActive"],
            }
        ],
        where: { isDeleted: false },
        order: [["name", "ASC"]],
    });
};

// Get all active modules with their permissions
export const getActiveModulesWithPermissions = async () => {
    return await Modules.findAll({
        include: [
            {
                model: Permissions,
                as: "permissions",
                where: { isDeleted: false, isActive: true },
                required: false,
                attributes: ["id", "name", "description", "action", "price", "isSystemPermission", "isSubscriptionExempt", "isFreeForAll", "isActive"],
            }
        ],
        where: { isActive: true, isDeleted: false },
        order: [["name", "ASC"]],
    });
};