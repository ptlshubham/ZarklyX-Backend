// premiumModule-handler.ts

import { Op } from "sequelize";
import { PremiumModule } from "../../../superAdmin/generalSetup/premiumModule/premiumModule-model";
const { MakeQuery } = require("../../../../../services/model-service");

// Add a new premium module
export const addPremiumModule = async (body: any, t: any) => {
  return await PremiumModule.create(body, { transaction: t });
};

// Get premium module by ID
export const getPremiumModuleByID = (params: any) => {
  return PremiumModule.findOne({
    where: {
      id: params.id,
    },
    raw: true,
  });
};

// Get all active premium modules
export const getAllPremiumModules = async () => {
  return await PremiumModule.findAll({
    where: {
      isActive: true,
    },
    raw: true,
  });
};

// Soft delete premium module (set isActive = false)
export const deletePremiumModule = async (id: number, t: any) => {
  return await PremiumModule.update(
    { isActive: false },
    { where: { id }, transaction: t }
  );
};

// Update premium module details
export const updatePremiumModule = async (id: number, body: any, t: any) => {
  return await PremiumModule.update(body, {
    where: { id },
    transaction: t,
  });
};

// Get premium module by name
export const getPremiumModuleByName = async (name: string) => {
  return await PremiumModule.findOne({
    where: { name },
    raw: true,
  });
};

// Check if a premium module is active by name
export const checkPremiumModuleActive = async (name: string) => {
  const moduleRecord = await PremiumModule.findOne({
    where: {
      name,
      isActive: true,
    },
  });
  return !!moduleRecord;
};

// dynamic filter with MakeQuery (if you use it for listing with filters)
export const getPremiumModulesWithFilter = async (query: any) => {
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

  return await PremiumModule.findAndCountAll(options);
};
