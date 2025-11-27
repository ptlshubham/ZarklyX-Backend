// premiumModule-handler.ts

import { Op } from "sequelize";
// import { PremiumModule } from "../../../superAdmin/generalSetup/premiumModule/premiumModule-model";
import { Category } from "../../../../../routes/api-webapp/superAdmin/generalSetup/category/category-model";
const { MakeQuery } = require("../../../../../services/model-service");

// Add a new Category module
export const addCategory = async (body: any, t: any) => {
  return await Category.create(body, { transaction: t });
};

// Get Category module by ID
export const getCategoryByID = (params: any) => {
  return Category.findOne({
    where: {
      id: params.id,
    },
    raw: true,
  });
};

// Get all active Category modules
export const getAllCategorys = async () => {
  return await Category.findAll({
    where: {
      isActive: true,
    },
    raw: true,
  });
};

// Soft delete Category module (set isActive = false)
export const deleteCategory = async (id: number, t: any) => {
  return await Category.update(
    { isActive: false },
    { where: { id }, transaction: t }
  );
};

// Update Category module details
export const updateCategory = async (id: number, body: any, t: any) => {
  return await Category.update(body, {
    where: { id },
    transaction: t,
  });
};
// export const updateCategory = async (id: number, body: any, t: any) => {
//   // Log for debugging
//   console.log("updateCategory -> id:", id);
//   console.log("updateCategory -> body:", body);

//   // Build only allowed fields
//   const payload: any = {};
//   if (body.icon !== undefined) payload.icon = body.icon;
//   if (body.name !== undefined) payload.name = body.name;
//   if (body.isActive !== undefined) payload.isActive = body.isActive;

//   console.log("updateCategory -> payload:", payload);

//   // 1) Run UPDATE
//   const [affectedRows] = await Category.update(payload, {
//     where: { id },
//     transaction: t,
//   });

//   console.log("updateCategory -> affectedRows:", affectedRows);

//   if (affectedRows === 0) {
//     throw new Error("Category not found or nothing to update");
//   }

//   // 2) Fetch updated record (no need to use transaction here)
//   const updated = await Category.findByPk(id, { raw: true });

//   return updated;
// };
// export const updateCategory = async (id: number, body: any, t: any) => {
//   // Only update the fields you allow
//   const payload = {
//     icon: body.icon ?? null,
//     name: body.name,
//     isActive: body.isActive,
//   };

//   // 1) Run UPDATE
//   await Category.update(payload, {
//     where: { id },               
//     transaction: t,
//   });

//   // 2) Fetch updated record
//   const updated = await Category.findOne({
//     where: { id },
//     transaction: t,
//     raw: true,
//   });

//   return updated;
// };


// Get Category module by name
export const getCategoryByName = async (name: string) => {
  return await Category.findOne({
    where: { name },
    raw: true,
  });
};

// Check if a Category module is active by name
export const checkCategoryActive = async (name: string) => {
  const moduleRecord = await Category.findOne({
    where: {
      name,
      isActive: true,
    },
  });
  return !!moduleRecord;
};

// dynamic filter with MakeQuery (if you use it for listing with filters)
export const getCategorysWithFilter = async (query: any) => {
  const where: any = {};

  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
    ];
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  const options = MakeQuery({
    where,
    query,
  });

  return await Category.findAndCountAll(options);
};
