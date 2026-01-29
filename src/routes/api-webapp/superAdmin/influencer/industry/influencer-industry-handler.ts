// premiumModule-handler.ts

import { Op, where } from "sequelize";
// import { PremiumModule } from "../../../superAdmin/generalSetup/premiumModule/premiumModule-model";
import { InfluencerIndustry } from "../industry/influencer-industry-model";
const { MakeQuery } = require("../../../../../services/model-service");

// Add a new InfluencerIndustry module
export const addInfluencerIndustry = async (body: any, t: any) => {
  return await InfluencerIndustry.create(body, { transaction: t });
};

// Get InfluencerIndustry module by ID
export const getInfluencerIndustryByID = (params: any) => {
  return InfluencerIndustry.findOne({
    where: {
      id: params.id,
    },
    raw: true,
  });
};

// Get all active InfluencerIndustry modules
export const getAllInfluencerIndustrys =async (
) => {
  return await InfluencerIndustry.findAll({
      where:{
  isActive:true
}
    ,raw: true,
  },

);
};


// hard delete InfluencerIndustry module (set isActive = false)
export const deleteInfluencerIndustry = async (id: string, t: any) => {
  return await InfluencerIndustry.destroy(
    { where: { id }, transaction: t }
  );
};

// Update InfluencerIndustry module details
export const updateInfluencerIndustry = async (id: string, body: any, t: any) => {
  return await InfluencerIndustry.update(body, {
    where: { id },
    transaction: t,
  });
};


// Get InfluencerIndustry module by name
export const getInfluencerIndustryByName = async (name: string) => {
  return await InfluencerIndustry.findOne({
    where: { name },
    raw: true,
  });
};

// Check if a InfluencerIndustry module is active by name
export const checkInfluencerIndustryActive = async (name: string) => {
  const moduleRecord = await InfluencerIndustry.findOne({
    where: {
      name,
      isActive: true,
    },
  });
  return !!moduleRecord;
};

// export const getInfluencerIndustrysWithFilter = async (query: any) => {
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

//   return await InfluencerIndustry.findAndCountAll(options);
// };
