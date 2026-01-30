
// import { User } from "../../../../routes/api-webapp/authentication/user/user-model"; // Ensure correct import
import { Clients } from "../../../../routes/api-webapp/agency/clients/clients-model";
import { Op, Transaction, where, fn, col } from "sequelize";
const { MakeQuery } = require("../../../../services/model-service");
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
  //   companyId?: number | null;   
  userName?: string | null;
  clientfirstName?: string;
  clientLastName?: string;
  businessName?: string | null;
  businessBase?: businessBase | "product" | "service";
  // businessType?: businessType | "advertising" | "technology" | "healthcare" | "other";
  businessTypeId?: number | null;
  businessSubCategory?: any[] | null;
  businessWebsite?: string;
  email?: string;
  businessEmail?: string;
  contact?: string;
  businessContact: string;
  businessExecutive: string;
  isdCode?: string | null;
  isoCode?: string | null;
  isoBusinessCode?: string | null;
  isdBusinessCode?: string | null;
  password?: string | null;
  confirmPassword?: string;
  country?: string;
  state?: string;
  city?: string;
  postcode?: string;
  address?: string;
  isVip?: boolean;
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  isRegistering?: boolean;
  registrationStep?: number;
  isActive?: boolean;
  isDeleted?: boolean;
  profile?: string | null;
  [key: string]: any;

}

// add AgencyClient 
export const addAgencyClient = async (body: ClientsPayload, t: Transaction) => {
  return Clients.create(body as any, { transaction: t });
};

/**
 * OPTIMIZED: Get client data with all counts in ONE efficient database operation
 * Fetches paginated data for the specified filter type + all three category counts
 * Uses database-level filtering and SQL COUNT() for performance
 */
export const getClientDataWithCounts = async (
  companyId: string,
  filterType: "approved" | "unassigned" | "pending",
  query: any,
  limit: number = 10,
  offset: number = 0
) => {
  // Build base WHERE clause
  const baseWhere: any = {
    companyId,
    isDeleted: false,
  };

  // Build filter-specific WHERE clause
  let dataWhere = { ...baseWhere };

  if (filterType === "approved") {
    dataWhere.isApprove = true;
    dataWhere.isassigned = true;
  } else if (filterType === "unassigned") {
    dataWhere.isApprove = true;
    dataWhere.isassigned = false;
  } else if (filterType === "pending") {
    dataWhere.isApprove = false;
  }

  // Apply search filter if provided
  if (query.search) {
    const s = query.search.toLowerCase();
    dataWhere[Op.or] = [
      { clientfirstName: { [Op.like]: `${s}%` } },
      { clientLastName: { [Op.like]: `${s}%` } },
      { email: { [Op.like]: `${s}%` } },
      { businessName: { [Op.like]: `${s}%` } },
    ];
  }

  // Fetch paginated data and counts in parallel
  const [dataResult, approvedCountResult, pendingCountResult, unassignedCountResult] = await Promise.all([
    // Get paginated data with applied filters
    Clients.findAndCountAll({
      where: dataWhere,
      limit,
      offset,
      raw: true,
      order: [["createdAt", "DESC"]],
    }),
    // Count approved & assigned
    Clients.count({
      where: {
        ...baseWhere,
        isApprove: true,
        isassigned: true,
      },
    }),
    // Count pending (unapproved)
    Clients.count({
      where: {
        ...baseWhere,
        isApprove: false,
      },
    }),
    // Count unassigned (approved but unassigned)
    Clients.count({
      where: {
        ...baseWhere,
        isApprove: true,
        isassigned: false,
      },
    }),
  ]);

  return {
    data: dataResult.rows,
    count: dataResult.count,
    counts: {
      approved: approvedCountResult,
      pending: pendingCountResult,
      unassigned: unassignedCountResult,
    },
  };
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

  if (query.companyId) {
    modalParam.where.push({ companyId: query.companyId });
  }

  // Add pagination only if not for Excel
  if (!forExcel) {
    modalParam.limit = limit;
    modalParam.offset = offset;
  }

  return Clients.findAndCountAll(modalParam);
};

// for get AgencyClient by ID
export const getagencyClientByid = async (id: string) => {
  return await Clients.findByPk(id);
  // returns null if not found
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

//to get Clients by email (excluding soft-deleted)
export const getClientsByEmail = (data: any) => {
  return Clients.findOne({
    where: {
      email: data.email,
      isDeleted: false, // Only check active clients
    },
    raw: true,
  });
};

//to get Clients by mobile no (excluding soft-deleted)
export const getClientsByMbMo = (data: any) => {
  return Clients.findOne({
    where: {
      contact: data.contact,
      isDeleted: false, // Only check active clients
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
export const getAgencyClientByUserId = async (userId: string) => {
  return await Clients.findOne({
    where: {
      userId,
    },
  });
};

