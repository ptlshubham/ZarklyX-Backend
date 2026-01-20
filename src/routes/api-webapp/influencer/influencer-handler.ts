import { Influencer } from "./influencer-model";
import bcrypt from "bcrypt";
import { Op, Transaction } from "sequelize";
import { MakeQuery } from "../../../services/model-service";

// Define InfluencerPayload type
export type InfluencerPayload = {
  id?: string;
  firstName?: string;
  lastName?: string;
  contact?: string;
  role?: string;
  email?: string;
  gender?: string;
  dob?: Date;
  country?: string;
  state?: string;
  city?: string;
  pincode?: string;
  address?: string;
  category?: string;
  platform?: string;
  bio?: string;
  profile_image?: string;
  profile_cover?: string;
  isfirstlogin?: boolean;
  createddate?: Date;
  updateddate?: Date;
  password?: string;
  authProvider?: string; // Added `authProvider` field to InfluencerPayload
};

// add Influencer 
export const addInfluencer = async (body: InfluencerPayload, t: Transaction) => {
  return Influencer.create(body as any, { transaction: t });
};

//for get Influencer filter
export const getAllInfluencer = (query: any) => {
  const {
    limit: rawLimit,
    offset: rawOffset,
    modelOption,
    orderBy,
    attributes,
    forExcel,
  } = MakeQuery({
    query,
    Model: Influencer,
  });

  // Parse limit and offset with fallback values
  const limit = Number(rawLimit) || 10;
  const offset = Number(rawOffset) || 0;

  let modalParam: any = {
    where: modelOption || {},
    attributes,
    order: orderBy,
    raw: true,
  };

  if (query.companyId) {
    modalParam.where.companyId = query.companyId;
  }

  // Add pagination only if not for Excel
  if (!forExcel) {
    modalParam.limit = limit;
    modalParam.offset = offset;
  }

  return Influencer.findAndCountAll(modalParam);
};

// Get influencer by ID
export const getInfluencerById = async (id: string) => {
  return Influencer.findOne({
    where: { id, isDeleted: false },
  });
};

// Update Influencer details
export const updateInfluencer = async (id: number, body: any, t: Transaction) => {
  return Influencer.update(body, { where: { id }, transaction: t });
};

//for delete Influencer soft Delete 
export const deleteInfluencer = async (id: number, t: Transaction) => {
  return Influencer.update(
    { isActive: false },
    { where: { id }, transaction: t }
  );
};

// Get influencer by email
export const getInfluencerByEmail = (email: string) => {
  return Influencer.findOne({
    where: {
      email,
      isDeleted: false,
    },
  });
};

// Get influencer by mobile
export const getInfluencerByMobile = (contact: string) => {
  return Influencer.findOne({
    where: {
      contact,
      isDeleted: false,
    },
  });
};

// Check influencer active
export const isInfluencerActive = async (email: string) => {
  const influencer = await Influencer.findOne({
    where: {
      email,
      isActive: true,
      isDeleted: false,
    },
  });
  return !!influencer;
};
// // Create Influencer
// export const createInfluencer = async (data: any) => {
//   const { password, ...otherData } = data;
//   const hashedPassword = await bcrypt.hash(password, 10);
//   const influencer = await Influencer.create({ ...otherData, password: hashedPassword });
//   return influencer;
// };

// // Login Influencer
// export const loginInfluencer = async (email: string, password: string) => {
//   const influencer = await Influencer.findOne({ where: { email } });
//   if (!influencer) {
//     throw new Error("Influencer not found");
//   }

//   const isPasswordValid = await bcrypt.compare(password, influencer.password || "");
//   if (!isPasswordValid) {
//     throw new Error("Invalid credentials");
//   }

//   return influencer;
// };
