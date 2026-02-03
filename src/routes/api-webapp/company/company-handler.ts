import { Company } from "../../../routes/api-webapp/company/company-model";
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

// Get companies associated with a user (via User.companyId)
export const getUserCompanies = async (userId: string) => {
  const user = await User.findByPk(userId);
  if (!user || !user.companyId) return [];
  
  const company = await Company.findByPk(user.companyId);
  
  if (!company || !company.isActive) return [];
  
  return [company];
};

// Get company with user's role info (via User.roleId)
export const getCompanyWithUserRole = async (
  userId: string,
  companyId: string
) => {
  const company = await Company.findByPk(companyId);
  if (!company) return null;

  const user = await User.findByPk(userId);
  if (!user || user.companyId !== companyId) return null;

  return {
    ...company.toJSON(),
    userRole: user.roleId,
    createdAt: user.createdAt,
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

// Add user to company (deprecated - users are assigned via User.companyId)
// This function is kept for backward compatibility but does nothing
export const addUserToCompany = async (
  userId: string,
  companyId: string,
  role?: string,
  isOwner?: boolean,
  transaction?: Transaction
) => {
  // No-op: User.companyId is set during user creation
  return null;
};

// Remove user from company (deprecated)
export const removeUserFromCompany = async (
  userId: string,
  companyId: string,
  transaction?: Transaction
) => {
  // No-op: User.companyId should be set to null instead
  const user = await User.findByPk(userId);
  if (user && user.companyId === companyId) {
    await user.update({ companyId: null, isActive: false }, { transaction });
  }
  return null;
};

// Update user role in company (deprecated - use User.roleId instead)
export const updateUserCompanyRole = async (
  userId: string,
  companyId: string,
  roleId: string,
  transaction?: Transaction
) => {
  const user = await User.findByPk(userId);
  if (!user || user.companyId !== companyId) {
    throw new Error("User-Company relationship not found");
  }
  return await user.update({ roleId }, { transaction });
};

// Get all users in a company
export const getCompanyUsers = async (companyId: string) => {
  return await User.findAll({
    where: { companyId, isActive: true, isDeleted: false },
    attributes: ["id", "firstName", "lastName", "email", "contact", "roleId", "createdAt"],
  });
};

// Get user by company and role
export const getUsersByCompanyAndRole = async (
  companyId: string,
  roleId: string
) => {
  return await User.findAll({
    where: { companyId, roleId, isActive: true, isDeleted: false },
    attributes: ["id", "firstName", "lastName", "email", "createdAt"],
  });
};

// Check if user belongs to company
export const isUserInCompany = async (userId: string, companyId: string) => {
  const user = await User.findOne({
    where: { id: userId, companyId, isActive: true, isDeleted: false },
  });
  return !!user;
};

// Get user's primary/default company
export const getUserPrimaryCompany = async (userId: string) => {
  const user = await User.findOne({
    where: { id: userId, isActive: true, isDeleted: false },
    include: [
      {
        model: Company,
        attributes: [
          "id",
          "name",
          "description",
          "logo",
          "email",
          "contact",
          "website",
        ],
      },
    ],
  });

  return user;
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
  userId: string,
  companyId: string,
  transaction?: Transaction
) => {
  const user = await User.findOne({
    where: { id: userId, companyId },
  });
  if (!user) throw new Error("User not found in company");
  return await user.update({ isActive: false }, { transaction });
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
