import { Company } from "../../../routes/api-webapp/company/company-model";
import { UserCompany } from "./user-company-model";
import { Op, Transaction, Sequelize } from "sequelize";
import { User } from "../../../routes/api-webapp/authentication/user/user-model";
// Get all companies
export const getAllCompanies = async () => {
  return await Company.findAll({
    where: { isActive: true },
    order: [["createdAt", "DESC"]],
  });
};

// Get company by ID
export const getCompanyById = async (companyId: number) => {
  return await Company.findByPk(companyId);
};

// Get companies associated with a user
export const getUserCompanies = async (userId: number) => {
  return await Company.findAll({
    include: [
      {
        model: User,
        where: { userId, status: "active" },
        attributes: ["id", "role", "isOwner", "status", "joinedAt"],
      },
    ],
    where: { isActive: true },
    order: [["createdAt", "DESC"]],
  });
};

// Get company with user's role/permission info
export const getCompanyWithUserRole = async (
  userId: string,
  companyId: string
) => {
  const company = await Company.findByPk(companyId);
  if (!company) return null;

  const userCompany = await UserCompany.findOne({
    where: { userId, companyId, status: "active" },
  });

  if (!userCompany) return null;

  return {
    ...company.toJSON(),
    userRole: userCompany.role,
    isOwner: userCompany.isOwner,
    joinedAt: userCompany.joinedAt,
  };
};

// Create a new company
export const createCompany = async (
  companyData: any,
  transaction?: Transaction
) => {
  return await Company.create(companyData, { transaction });
};

// Update company
export const updateCompany = async (
  companyId: string,
  updateData: any,
  transaction?: Transaction
) => {
  const company = await Company.findByPk(companyId);
  if (!company) throw new Error("Company not found");
  return await company.update(updateData, { transaction });
};

// Add user to company
// export const addUserToCompany  = async (
//   userId: number,
//   companyId: number,
//   role: "admin" | "manager" | "employee" | "viewer" = "employee",
//   isOwner: boolean = false,
//   transaction?: Transaction
// ) => {
//   return await UserCompany.create(
//     {
//       userId,
//       companyId,
//       role,
//       isOwner,
//       status: "active",
//       joinedAt: new Date(),
//     },
//     { transaction }
//   );
// };
export const addUserToCompany = async (
  userId: string,
  companyId: string,
  role: "admin" | "manager" | "employee" | "viewer" = "employee",
  isOwner: boolean = false,
  transaction?: Transaction
) => {
  return await UserCompany.create(
    {
      userId,
      companyId,
      role,
      isOwner,
      status: "active",
      joinedAt: new Date(),
    },
    { transaction }
  );
};

// Remove user from company
export const removeUserFromCompany = async (
  userId: string,
  companyId: string,
  transaction?: Transaction
) => {
  return await UserCompany.destroy({
    where: { userId, companyId },
    transaction,
  });
};

// Update user role in company
export const updateUserCompanyRole = async (
  userId: string,
  companyId: string,
  role: "admin" | "manager" | "employee" | "viewer",
  transaction?: Transaction
) => {
  const userCompany = await UserCompany.findOne({
    where: { userId, companyId },
  });
  if (!userCompany) throw new Error("User-Company relationship not found");
  return await userCompany.update({ role }, { transaction });
};

// Get all users in a company
export const getCompanyUsers = async (companyId: number) => {
  return await UserCompany.findAll({
    where: { companyId, status: "active" },
    attributes: ["userId", "role", "isOwner", "joinedAt"],
    include: [
      {
        model: "User" as any,
        attributes: ["id", "name", "email", "mobile_number", "profile_completed"],
      },
    ],
  });
};

// Get user by company and role
export const getUsersByCompanyAndRole = async (
  companyId: number,
  role: string
) => {
  return await UserCompany.findAll({
    where: { companyId, role, status: "active" },
    attributes: ["userId", "isOwner", "joinedAt"],
  });
};

// Check if user belongs to company
export const isUserInCompany = async (userId: string, companyId: string) => {
  const userCompany = await UserCompany.findOne({
    where: { userId, companyId, status: "active" },
  });
  return !!userCompany;
};

// Get user's primary/default company (first one or specified)
export const getUserPrimaryCompany = async (userId: number) => {
  const userCompanyRel = await UserCompany.findOne({
    where: { userId, status: "active" },
    order: [["isOwner", "DESC"], ["createdAt", "ASC"]],
    include: [
      {
        model: Company,
        as: "company",
        attributes: [
          "id",
          "name",
          "description",
          "logo",
          "email",
          "phone",
          "website",
        ],
      },
    ],
  });

  return userCompanyRel;
};

// List all companies with employee count
export const getAllCompaniesWithStats = async () => {
  const companies = await Company.findAll({
    where: { isActive: true },
    order: [["createdAt", "DESC"]],
  });

  return companies;
};

// Deactivate user from company
export const deactivateUserCompany = async (
  userId: number,
  companyId: number,
  transaction?: Transaction
) => {
  const userCompany = await UserCompany.findOne({
    where: { userId, companyId },
  });
  if (!userCompany) throw new Error("User-Company relationship not found");
  return await userCompany.update({ status: "inactive" }, { transaction });
};

// Valid asset types for company branding
const VALID_ASSET_TYPES = [
  'companyLogoLight',
  'companyLogoDark',
  'faviconLight',
  'faviconDark',
  'employeeLoginBanner',
  'clientLoginBanner',
  'clientSignupBanner'
];

// Validate asset type
export const validateAssetType = (assetType: string): boolean => {
  return VALID_ASSET_TYPES.includes(assetType);
};

// Get valid asset types list
export const getValidAssetTypes = (): string[] => {
  return VALID_ASSET_TYPES;
};

// Remove company asset
export const removeCompanyAsset = async (
  companyId: string,
  assetType: string,
  transaction: Transaction
) => {
  const company = await Company.findByPk(companyId);
  if (!company) return null;

  const currentAssetPath = (company.dataValues as any)[assetType];
  
  // Update company to remove the asset
  await company.update({ [assetType]: null }, { transaction });

  // Delete file from disk if it exists
  if (currentAssetPath) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const filePath = path.join(process.cwd(), 'src', 'public', currentAssetPath.replace(/^\//, ''));
      await fs.unlink(filePath).catch(() => { });
    } catch (err) {
      console.warn(`Failed to delete file at ${currentAssetPath}:`, err);
    }
  }

  return { success: true, assetType, companyId };
};

// Upload company asset
export const uploadCompanyAsset = async (
  companyId: string,
  assetType: string,
  file: Express.Multer.File,
  transaction: Transaction
) => {
  const company = await Company.findByPk(companyId);
  if (!company) return null;

  const oldAssetPath = (company.dataValues as any)[assetType];
  const path = require('path');

  // Build relative URL
  const filePathRelative = `/${path.relative(path.join(process.cwd(), "src/public"), file.path).replace(/\\/g, "/")}`;

  // Update DB
  await company.update({ [assetType]: filePathRelative } as any, { transaction });

  // Remove old file from disk after commit
  if (oldAssetPath) {
    try {
      const fs = require("fs").promises;
      const oldFilePath = path.join(process.cwd(), "src", "public", oldAssetPath.replace(/^\//, ""));
      await fs.unlink(oldFilePath).catch(() => { });
    } catch (err) {
      console.warn(`Failed to delete old asset ${oldAssetPath}:`, err);
    }
  }

  return { filePath: filePathRelative };
};
