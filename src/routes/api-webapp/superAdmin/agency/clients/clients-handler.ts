
// import { User } from "../../../../routes/api-webapp/authentication/user/user-model"; // Ensure correct import
import { Clients } from "../../../../../routes/api-webapp/superAdmin/agency/clients/clients-model";
import { Op, Transaction } from "sequelize";
const { MakeQuery } = require("../../../../../services/model-service");
// const { MakeQuery } = require("../../../services/model-service");
import axios from "axios";


console.log(Clients);
// user type
export enum businessBase {
  PRODUCT = "product",
  SERVICE = "service",
}

// login type
export enum LoginType {
  EMAIL = "email",
  GOOGLE = "google",
  FACEBOOK = "facebook",
}

export enum businessType {
  ADVERTISING = "advertising",
  TECHNOLOGY = "technology",
  HEALTHCARE = "healthcare",
  OTHER = "other",
}
const LoginType_fields = [
  "id",
  "email"
];

// Define the user payload interface
interface ClientsPayload {
//   referId?: string | null;
//   companyId?: number | null;        // Required for step 5
  ownerName?: string | null;
  businessName?: string | null;
  businessBase?: businessBase | "product" | "service"; 
  businessType?: businessType | "advertising" | "technology" | "healthcare" | "other";
  businessWebsite?: string;
  email?: string;
  businessEmail?: string;
  contact?: string;
  businessContact: string;
  countryCode:  string | null;
  password?: string;
  confirmPassword?: string;
  country?: string;
  state?: string;
  city?: string;
  postcode?: string;
  address?: string;
  isVip?: boolean;
  BusinessSubCategory?: any[] | null; 
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  isRegistering?: boolean;
  registrationStep?: number;
  isActive?: boolean;
  isDeleted?: boolean;
  [key: string]: any;

}

// Function to add AgencyClient to DB
export const addAgencyClient = async (body: ClientsPayload, t: Transaction) => {
  return Clients.create(body as any, { transaction: t });
};

//for get AgencyClient filter
export const getAllAgencyClient = (query: any) => {
  const {
    limit: rawLimit,
    offset: rawOffset,
    modelOption,
    orderBy,
    attributes,
    forExcel,
  } = MakeQuery({
    query,
    Model: Clients,
  });

  // Parse limit and offset with fallback values
  const limit = Number(rawLimit) || 10;
  const offset = Number(rawOffset) || 0;

  let modalParam: any = {
    where: modelOption,
    attributes,
    order: orderBy,
    raw: true,
    // include, // You can uncomment this if needed
  };

  // Add pagination only if not for Excel
  if (!forExcel) {
    modalParam.limit = limit;
    modalParam.offset = offset;
  }

  return Clients.findAndCountAll(modalParam);
};

// for get AgencyClient by ID
export const getagencyClientByid = async (id: string) => {
  return await Clients.findByPk(id); // returns null if not found
};

// Update AgencyClient details
export const updateAgencyClient = async (id: number, body: any, t: any) => {
  return await Clients.update(body, { where: { id }, transaction: t });
};

//for delete AgencyClient soft Delete 
export const deleteAgencyClient = async (id: number, t: any) => {
  return await Clients.update(
    { isActive: false },
    { where: { id }, transaction: t }
  );
};

//to get Clients by email
export const getClientsByEmail = (data: any) => {
  return Clients.findOne({
    where: {
      email: data.email,
    },
    raw: true,
  });
};

//to get Clients by mobile no
export const getClientsByMbMo = (data: any) => {
  return Clients.findOne({
    where: {
      contact: data.contact,
    },
    raw: true,
  });

};

//check Clients is Active or not 
export const checkUserActive = async (email: string) => {
  const clients = await Clients.findOne({
    where: {
      email,
      // isActive: true, // or whatever your column is
    },
  });
  return !!clients;
};

