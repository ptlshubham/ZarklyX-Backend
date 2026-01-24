import express, { Request, Response } from "express";
import { Company } from "../../../routes/api-webapp/company/company-model";
import { UserCompany } from "../../../routes/api-webapp/company/user-company-model"
import { User } from "../../../routes/api-webapp/authentication/user/user-model";
import {
  getUserCompanies,
  getCompanyWithUserRole,
  createCompany,
  updateCompany,
  addUserToCompany,
  removeUserFromCompany,
  updateUserCompanyRole,
  isUserInCompany,
  getUserPrimaryCompany,
  deactivateUserCompany,
} from "./company-handler";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import {
  serverError,
  alreadyExist,
} from "../../../utils/responseHandler";
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import { notFound, other } from "../../../services/response";
import dbInstance from "../../../db/core/control-db";
import ErrorLogger from "../../../db/core/logger/error-logger";
import { companyAssetsUpload } from "../../../services/multer";
import path from "path";

const router = express.Router();

/**
 * GET /company/list
 * Get all companies associated with the logged-in user
 * Returns list of companies with user's role in each
 */
router.get("/list", tokenMiddleWare, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId: any = (req as any).user?.id;
    if (!userId) {
      return serverError(res, "User ID not found in token");
    }

    const companies = await getUserCompanies(userId);

    if (!companies || companies.length === 0) {
      return sendEncryptedResponse(
        res,
        { companies: [] },
        "No companies associated with this user"
      );
    }

    const formattedCompanies = companies.map((company: any) => {
      const userCompanyData = company.UserCompanies?.[0] || {};
      return {
        id: company.id,
        name: company.name,
        description: company.description,
        logo: company.logo,
        email: company.email,
        contact: company.contact,
        no_of_clients: company.no_of_clients,
        address: company.address,
        website: company.website,
        industryType: company.industryType,
        userRole: userCompanyData.role,
        isOwner: userCompanyData.isOwner,
        joinedAt: userCompanyData.joinedAt,
        isActive: company.isActive,
      };
    });

    return sendEncryptedResponse(
      res,
      { companies: formattedCompanies },
      "Companies retrieved successfully"
    );
  } catch (error: any) {
    ErrorLogger.write({ type: "getCompanies error", error });
    return serverError(res, error?.message || "Failed to retrieve companies");
  }
});

/**
 * GET /company/details/:companyId
 * Get detailed information about a specific company
 * (Same as Facebook profile view)
 */
router.get("/details/:companyId",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<any> => {
    try {
      const userId: any = (req as any).user?.id;
      let { companyId } = req.params;
      if (Array.isArray(companyId)) companyId = companyId[0];

      if (!userId) {
        return serverError(res, "User ID not found in token");
      }

      if (!companyId) {
        return serverError(res, "Company ID is required");
      }

      // Check if user has access to this company
      const hasAccess = await isUserInCompany(userId, companyId);
      if (!hasAccess) {
        return serverError(res, "You do not have access to this company");
      }

      // Get company details with user's role
      const companyDetails = await getCompanyWithUserRole(
        userId,
        companyId
      );

      if (!companyDetails) {
        return notFound(res, "Company not found");
      }

      return sendEncryptedResponse(
        res,
        companyDetails,
        "Company details retrieved successfully"
      );
    } catch (error: any) {
      ErrorLogger.write({ type: "getCompanyDetails error", error });
      return serverError(
        res,
        error?.message || "Failed to retrieve company details"
      );
    }
  }
);

/**
 * POST /company/switch/:companyId
 * Switch to a specific company
 * Returns the company data after switch (like viewing a profile)
 */
router.post("/switch/:companyId",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<any> => {
    try {
      const userId: any = (req as any).user?.id;
      let { companyId } = req.params;
      if (Array.isArray(companyId)) companyId = companyId[0];

      if (!userId) {
        return serverError(res, "User ID not found in token");
      }

      if (!companyId) {
        return serverError(res, "Company ID is required");
      }

      // Verify user belongs to this company
      const hasAccess = await isUserInCompany(userId, companyId);
      if (!hasAccess) {
        return serverError(res, "You cannot switch to this company");
      }

      // Get company details with full information
      const companyData = await getCompanyWithUserRole(
        userId,
        companyId
      );

      if (!companyData) {
        return notFound(res, "Company not found");
      }

      // Log the company switch (optional - for audit trail)
      // You can save this to a logs table if needed

      return sendEncryptedResponse(
        res,
        {
          currentCompany: companyData,
          message: `Switched to ${companyData.name}`,
        },
        `Successfully switched to ${companyData.name}`
      );
    } catch (error: any) {
      ErrorLogger.write({ type: "switchCompany error", error });
      return serverError(res, error?.message || "Failed to switch company");
    }
  }
);

/**
 * POST /company/create
 * Create a new company (Admin only)
 */
router.post("/addCompany",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const userId: any = (req as any).user?.id;
      const {
        name,
        description,
        email,
        contact,
        isdCode,
        isoCode,
        address,
        city,
        state,
        zipcode,
        country,
        timezone,
        no_of_clients,
        website,
        logo,
        registrationNumber,
        industryType,
        accountType,
        businessArea,
        bankName,
        branchName,
        adCode,
        upiId,
        accountNumber,
        ifscCode,
        swiftCode,
        accountHolderName,
        tin,
        lst,
        pan,
        fssaiNo,
        dlNo,
        cst,
        tan,
        currency,
        gstin,
        serviceTaxNumber,
        taxationType,
        taxInclusiveRate,
      } = req.body;

      if (!userId) {
        await t.rollback();
        return serverError(res, "User ID not found in token");
      }

      if (!name) {
        await t.rollback();
        return serverError(res, "Company name is required");
      }

      // Check if company name already exists
      const existingCompany = await Company.findOne({ where: { name } });
      if (existingCompany) {
        await t.rollback();
        return alreadyExist(res, "Company name already exists");
      }

      // Create company
      const company = await createCompany(
        {
          name,
          description,
          email,
          contact,
          isdCode,
          isoCode,
          address,
          city,
          state,
          zipcode,
          country,
          website,
          timezone,
          no_of_clients,
          logo,
          registrationNumber,
          industryType,
          accountType,
          businessArea,
          bankName,
          branchName,
          adCode,
          upiId,
          accountNumber,
          ifscCode,
          swiftCode,
          accountHolderName,
          tin,
          lst,
          pan,
          fssaiNo,
          dlNo,
          cst,
          tan,
          currency,
          gstin,
          serviceTaxNumber,
          taxationType,
          taxInclusiveRate,
          isActive: true,
        },
        t
      );

      // Add creator as company owner
      await addUserToCompany(userId, company.id, "admin", true, t);

      await t.commit();

      return sendEncryptedResponse(
        res,
        {
          companyId: company.id,
          name: company.name,
          createdAt: company.createdAt,
        },
        "Company created successfully"
      );
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "createCompany error", error });
      return serverError(res, error?.message || "Failed to create company");
    }
  }
);


// Add Company Details Endpoint
// router.post("/add-company-details", tokenMiddleWare, async (req, res) => {
//   try {
//     const {
//       companyName,
//       website,
//       country,
//       timezone,
//     } = req.body;
//     const userId = req.user.id;

//     // Validation
//     if (!companyName || !website || !country || !timezone) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields for company details.",
//       });
//     }

//     // Update user's record with company details
//     const user = await User.findByPk(userId);
//     if (!user) {
//       return notFound(res, "User not found.");
//     }

//     user.companyName = companyName;
//     user.website = website;
//     user.country = country;
//     user.timezone = timezone;
//     await user.save();

//     return res.status(200).json({
//       success: true,
//       message: "Company details added successfully.",
//     });
//   } catch (error: any) {
//     ErrorLogger.write({ type: "add-company-details error", error });
//     return serverError(res, error.message || "Failed to add company details.");
//   }
// });
/**
 * PUT /company/updateById/:id
 * Update company details (Admin/Owner only)
 */
router.put("/updateById/:id",
  async (req: Request, res: Response): Promise<any> => {
    console.log("Update Company API called", req.body);
    const t = await dbInstance.transaction();
    try {
      const userId: any = (req as any).user?.id || req.body.user_id;
      let { id } = req.params;
      if (Array.isArray(id)) id = id[0];

      if (!userId) {
        await t.rollback();
        return serverError(res, "User ID not found in token");
      }

      if (!id) {
        await t.rollback();
        return serverError(res, "Company ID is required");
      }

      // Update company
      const updatedCompany = await updateCompany(
        id,
        req.body,
        t
      );

      await t.commit();

      return sendEncryptedResponse(
        res,
        updatedCompany,
        "Company updated successfully"
      );
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "updateCompany error", error });
      return serverError(res, error?.message || "Failed to update company");
    }
  }
);

/**
 * POST /company/:companyId/add-user
 * Add a user to a company (Admin/Owner only)
 */
router.post("/:companyId/add-user",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const userId: any = (req as any).user?.id;
      let { companyId } = req.params;
      if (Array.isArray(companyId)) companyId = companyId[0];
      const { targetUserId, role = "employee", isOwner = false } = req.body;

      if (!userId) {
        await t.rollback();
        return serverError(res, "User ID not found in token");
      }

      if (!companyId || !targetUserId) {
        await t.rollback();
        return serverError(res, "Company ID and User ID are required");
      }

      // Check permissions
      //   const userCompany = await UserCompany.findOne({
      //     where: { userId, companyId: parseInt(companyId) },
      //   });

      //   if (!userCompany || !["admin"].includes(userCompany.role)) {
      //     await t.rollback();
      //     return serverError(res, "You do not have permission to add users");
      //   }

      // Check if target user exists
      const targetUser = await User.findByPk(targetUserId);
      if (!targetUser) {
        await t.rollback();
        return notFound(res, "User not found");
      }

      // Check if user already in company
      const existingRelation = await UserCompany.findOne({
        where: {
          userId: targetUserId,
          companyId: companyId,
        },
      });

      if (existingRelation) {
        await t.rollback();
        return alreadyExist(res, "User already associated with this company");
      }

      // Add user to company
      await addUserToCompany(
        targetUserId,
        companyId,
        role,
        isOwner,
        t
      );

      await t.commit();

      return sendEncryptedResponse(
        res,
        { userId: targetUserId, role, isOwner },
        "User added to company successfully"
      );
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "addUserToCompany error", error });
      return serverError(res, error?.message || "Failed to add user to company");
    }
  }
);

/**
 * DELETE /company/:companyId/remove-user/:targetUserId
 * Remove a user from a company (Admin/Owner only)
 */
router.delete("/:companyId/remove-user/:targetUserId",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const userId: any = (req as any).user?.id;
      let { companyId, targetUserId } = req.params;
      if (Array.isArray(companyId)) companyId = companyId[0];
      if (Array.isArray(targetUserId)) targetUserId = targetUserId[0];

      if (!userId) {
        await t.rollback();
        return serverError(res, "User ID not found in token");
      }

      if (!companyId || !targetUserId) {
        await t.rollback();
        return serverError(res, "Company ID and User ID are required");
      }

      // Check permissions
      //   const userCompany = await UserCompany.findOne({
      //     where: { userId, companyId: parseInt(companyId) },
      //   });

      //   if (!userCompany || !["admin"].includes(userCompany.role)) {
      //     await t.rollback();
      //     return serverError(res, "You do not have permission to remove users");
      //   }

      // Remove user from company
      await removeUserFromCompany(
        targetUserId,
        companyId,
        t
      );

      await t.commit();

      return sendEncryptedResponse(res, {}, "User removed from company successfully");
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "removeUserFromCompany error", error });
      return serverError(res, error?.message || "Failed to remove user from company");
    }
  }
);

/**
 * PATCH /company/removeCompanyAsset/:assetType
 * Remove a company asset image (Admin/Owner only)
 * Params: assetType (companyLogoLight | companyLogoDark | faviconLight | faviconDark)
 * Body: { companyId }
 */
router.patch("/removeCompanyAsset/:assetType", tokenMiddleWare, async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.body;
    let assetType = req.params.assetType as string | string[];
    if (Array.isArray(assetType)) assetType = assetType[0];
    const userId: any = (req as any).user?.id;

    if (!companyId || !assetType || !userId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "companyId and userId are required and assetType must be provided as URL parameter",
      });
    }

    if (!['companyLogoLight', 'companyLogoDark', 'faviconLight', 'faviconDark'].includes(assetType)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid assetType. Must be one of: companyLogoLight, companyLogoDark, faviconLight, faviconDark",
      });
    }

    // Get company to verify it exists
    const company = await Company.findByPk(companyId);
    if (!company) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // Get current asset path for file deletion
    const currentAssetPath = (company.dataValues as any)[assetType];

    // Update company to remove the asset
    await company.update({ [assetType]: null }, { transaction: t });

    // Delete file from disk if it exists
    if (currentAssetPath) {
      try {
        const fs = require('fs').promises;
        const filePath = path.join(process.cwd(), 'src', 'public', currentAssetPath.replace(/^\//, ''));
        await fs.unlink(filePath).catch(() => { }); // Silently ignore if file doesn't exist
      } catch (err) {
        console.warn(`Failed to delete file at ${currentAssetPath}:`, err);
      }
    }

    await t.commit();

    return res.status(200).json({
      success: true,
      message: `${assetType} removed successfully`,
      data: {
        companyId,
        assetType,
        removed: true,
      },
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "removeCompanyAsset error", error });
    return serverError(res, error?.message || "Failed to remove company asset");
  }
});

router.post(
  "/uploadAsset/:assetType",
  tokenMiddleWare,
  companyAssetsUpload.single("file"),
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const { companyId } = req.body;
      let assetType = req.params.assetType as string | string[];
      if (Array.isArray(assetType)) assetType = assetType[0];
      const userId: any = (req as any).user?.id;

      if (!companyId || !assetType || !userId) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "companyId and userId are required and assetType must be provided as URL parameter",
        });
      }

      if (!['companyLogoLight', 'companyLogoDark', 'faviconLight', 'faviconDark'].includes(assetType)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid assetType. Must be one of: companyLogoLight, companyLogoDark, faviconLight, faviconDark",
        });
      }

      if (!req.file) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "No file uploaded. Use form-data field 'file'" });
      }

      // Verify company exists
      const company = await Company.findByPk(companyId);
      if (!company) {
        // cleanup uploaded file
        try {
          const fs = require("fs").promises;
          const uploadedPath = path.join(process.cwd(), "src", "public", `${path.relative(path.join(process.cwd(), "src/public"), req.file.path)}`);
          await fs.unlink(uploadedPath).catch(() => { });
        } catch (e) { }

        await t.rollback();
        return res.status(404).json({ success: false, message: "Company not found" });
      }

      const oldAssetPath = (company.dataValues as any)[assetType];

      // Build relative URL for returned path (matches frontend expectation: filePath)
      const filePathRelative = `/${path.relative(path.join(process.cwd(), "src/public"), req.file.path).replace(/\\/g, "/")}`;

      // Update DB immediately
      await company.update({ [assetType]: filePathRelative } as any, { transaction: t });

      await t.commit();

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

      return res.status(200).json({ success: true, data: { filePath: filePathRelative }, message: `${assetType} uploaded successfully` });
    } catch (error: any) {
      // cleanup uploaded file on error
      try {
        if (req.file) {
          const fs = require("fs").promises;
          const newFilePath = path.join(process.cwd(), "src", "public", `${path.relative(path.join(process.cwd(), "src/public"), req.file.path)}`);
          await fs.unlink(newFilePath).catch(() => { });
        }
      } catch (e) { }

      await t.rollback();
      ErrorLogger.write({ type: "uploadAsset error", error });
      return serverError(res, error?.message || "Failed to upload asset");
    }
  }
);

export default router;
