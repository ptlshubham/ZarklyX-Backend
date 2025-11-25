import { Company } from "../../../routes/api-webapp/company/company-model";
import { UserCompany } from "./user-company-model";
import { Op, Transaction, Sequelize } from "sequelize";
import { User } from "../../../routes/api-webapp/user/user-model";
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
  userId: number,
  companyId: number
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
  companyId: number,
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
export const addUserToCompany  = async (
  userId: number,
  companyId: number,
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
  userId: number,
  companyId: number,
  transaction?: Transaction
) => {
  return await UserCompany.destroy({
    where: { userId, companyId },
    transaction,
  });
};

// Update user role in company
export const updateUserCompanyRole = async (
  userId: number,
  companyId: number,
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
export const isUserInCompany = async (userId: number, companyId: number) => {
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
