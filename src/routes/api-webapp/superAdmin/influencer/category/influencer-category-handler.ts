import { InfluencerCategory } from './influencer-category-model';
// premiumModule-handler.ts

import { Op } from "sequelize";
// import { PremiumModule } from "../../../superAdmin/generalSetup/premiumModule/premiumModule-model";
const { MakeQuery } = require("../../../../../services/model-service");

// Add a new InfluencerCategory module
export const addInfluencerCategory = async (body: any, t: any) => {
  return await InfluencerCategory.create(body, { transaction: t });
};

// Get InfluencerCategory module by ID
export const getInfluencerCategoryByID = (params: any) => {
  return InfluencerCategory.findOne({
    where: {
      id: params.id,
    },
    raw: true,
  });
};

// Get all active InfluencerCategory modules
export const getAllInfluencerCategorys = async () => {
  return await InfluencerCategory.findAll({
    where:{
  isActive:true
},

    raw: true,
  });
};


// hard delete InfluencerCategory module (set isActive = false)
export const deleteInfluencerCategory = async (id: string, t: any) => {
  return await InfluencerCategory.destroy(
    { where: { id }, transaction: t }
  );
};

// Update InfluencerCategory module details
export const updateInfluencerCategory = async (id: string, body: any, t: any) => {
  return await InfluencerCategory.update(body, {
    where: { id },
    transaction: t,
  });
};

export const getInfluencerCategoryByName = async (name: string) => {
  return await InfluencerCategory.findOne({
    where: { name },
    raw: true,
  });
};

// Check if a InfluencerCategory module is active by name
export const checkInfluencerCategoryActive = async (name: string) => {
  const moduleRecord = await InfluencerCategory.findOne({
    where: {
      name,
      isActive: true,
    },
  });
  return !!moduleRecord;
};

// export const getInfluencerCategorysWithFilter = async (query: any) => {
//   const where: any = {};

//   if (query.search) {
//     where[Op.or] = [
//       { name: { [Op.like]: `%${query.search}%` } },
//     ];
//   }

//   if (query.isActive !== undefined) {
//     where.isActive = query.isActive;
//   }

//   const options = MakeQuery({
//     where,
//     query,
//   });

//   return await InfluencerCategory.findAndCountAll(options);
// };
