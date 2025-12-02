// src/routes/api-webapp/superAdmin/generalSetup/businessType/businessType-api.ts

import express from "express";
import { Request, Response } from "express";
import dbInstance from "../../../../../db/core/control-db";
import {
  serverError,
  alreadyExist,
} from "../../../../../utils/responseHandler";
import { notFound } from "../../../../../services/response";

import {
  addBusinessType,
  updateBusinessType,
  deleteBusinessTypeSoft,
  getBusinessTypeById,
  getAllBusinessTypes,
  addBusinessSubcategory,
  updateBusinessSubcategory,
  deleteBusinessSubcategorySoft,
  getBusinessSubcategoryById,
  getAllBusinessSubcategories,
  getSubcategoriesByBusinessType,
} from "./businessType-handler";

import { BusinessType } from "./businessType-model";
import { BusinessSubcategory } from "./businessSubcategory-model";
import { Op } from "sequelize";

const router = express.Router();

// Add
router.post(
  "/business-type/add",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const { name, description, isActive } = req.body;

      if (!name) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "name is required",
        });
        return;
      }

      // check duplicate
      const existing = await BusinessType.findOne({
        where: { name, isDeleted: false },
        transaction: t,
      });
      if (existing) {
        await t.rollback();
        alreadyExist(res, "Business Type with this name already exists.");
        return;
      }

      const bt = await addBusinessType(
        { name, description, isActive },
        t
      );

      await t.commit();
      res.status(201).json({
        success: true,
        message: "Business Type created successfully.",
        data: bt,
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[/business-type/add] ERROR:", err);
      serverError(res, err.message || "Failed to create business type.");
    }
  }
);

// List (with filters & pagination)
router.get("/business-type/getAll",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await getAllBusinessTypes(req.query);
      res.status(200).json({
        success: true,
        message: "Business types fetched successfully.",
        data: result,
      });
    } catch (err: any) {
      console.error("[/business-type] ERROR:", err);
      serverError(res, err.message || "Failed to fetch business types.");
    }
  }
);

// Get by id
router.get("/business-type/getBusinessTypeById",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({
          success: false,
          message: "Valid id is required.",
        });
        return;
      }

      const bt = await getBusinessTypeById(id);
      if (!bt) {
        notFound(res, "Business Type not found.");
        return;
      }

      res.status(200).json({
        success: true,
        message: "Business Type fetched successfully.",
        data: bt,
      });
    } catch (err: any) {
      console.error("[/business-type/:id] ERROR:", err);
      serverError(res, err.message || "Failed to fetch business type.");
    }
  }
);

// Update
router.put("/business-type/updateBusinessTypeById",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const id = Number(req.params.id);
      if (!id) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Valid id is required.",
        });
        return;
      }

      const bt = await BusinessType.findByPk(id, { transaction: t });
      if (!bt || bt.isDeleted) {
        await t.rollback();
        notFound(res, "Business Type not found.");
        return;
      }

      const { name, description, isActive } = req.body;

      if (name) {
        // duplicate check
        const exists = await BusinessType.findOne({
          where: {
            id: { [Op.ne]: id },
            name,
            isDeleted: false,
          },
          transaction: t,
        });
        if (exists) {
          await t.rollback();
          alreadyExist(res, "Another Business Type with this name already exists.");
          return;
        }
      }

      await updateBusinessType(
        id,
        { name, description, isActive },
        t
      );

      await t.commit();
      res.status(200).json({
        success: true,
        message: "Business Type updated successfully.",
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[/business-type/updateById/:id] ERROR:", err);
      serverError(res, err.message || "Failed to update business type.");
    }
  }
);

// Soft delete
router.delete(
  "/business-type/deleteBusinessTypeById/:id",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const id = Number(req.params.id);
      if (!id) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Valid id is required.",
        });
        return;
      }

      const bt = await BusinessType.findByPk(id, { transaction: t });
      if (!bt || bt.isDeleted) {
        await t.rollback();
        notFound(res, "Business Type not found.");
        return;
      }

      await deleteBusinessTypeSoft(id, t);
      await t.commit();
      res.status(200).json({
        success: true,
        message: "Business Type deleted (soft) successfully.",
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[/business-type/deleteById/:id] ERROR:", err);
      serverError(res, err.message || "Failed to delete business type.");
    }
  }
);

  // BUSINESS SUBCATEGORY APIs

// Add
router.post("/business-subcategory/addBusinessSubcategory",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const { businessTypeId, name, description, isActive } = req.body;

      if (!businessTypeId || !name) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "businessTypeId and name are required.",
        });
        return;
      }

      // ensure businessType exists
      const bt = await BusinessType.findByPk(businessTypeId, { transaction: t });
      if (!bt || bt.isDeleted) {
        await t.rollback();
        notFound(res, "Business Type not found for this subcategory.");
        return;
      }

      const subcat = await addBusinessSubcategory(
        { businessTypeId, name, description, isActive },
        t
      );

      await t.commit();
      res.status(201).json({
        success: true,
        message: "Business Subcategory created successfully.",
        data: subcat,
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[/business-subcategory/add] ERROR:", err);
      serverError(res, err.message || "Failed to create subcategory.");
    }
  }
);

// List (filters: businessTypeId, name, isActive, etc.)
router.get("/business-subcategory/getAllBusinessSubcategory",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await getAllBusinessSubcategories(req.query);
      res.status(200).json({
        success: true,
        message: "Business subcategories fetched successfully.",
        data: result,
      });
    } catch (err: any) {
      console.error("[/business-subcategory] ERROR:", err);
      serverError(res, err.message || "Failed to fetch subcategories.");
    }
  }
);

// Get by id
router.get("/business-subcategory/getBusinessSubcategoryId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({
          success: false,
          message: "Valid id is required.",
        });
        return;
      }

      const sub = await getBusinessSubcategoryById(id);
      if (!sub) {
        notFound(res, "Business Subcategory not found.");
        return;
      }

      res.status(200).json({
        success: true,
        message: "Business Subcategory fetched successfully.",
        data: sub,
      });
    } catch (err: any) {
      console.error("[/business-subcategory/:id] ERROR:", err);
      serverError(res, err.message || "Failed to fetch subcategory.");
    }
  }
);

// Update
router.put("/business-subcategory/updateBusinessSubcategoryById",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const id = Number(req.params.id);
      if (!id) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Valid id is required.",
        });
        return;
      }

      const existing = await BusinessSubcategory.findByPk(id, { transaction: t });
      if (!existing || existing.isDeleted) {
        await t.rollback();
        notFound(res, "Business Subcategory not found.");
        return;
      }

      const { businessTypeId, name, description, isActive } = req.body;

      // if businessTypeId change, validate
      if (businessTypeId) {
        const bt = await BusinessType.findByPk(businessTypeId, { transaction: t });
        if (!bt || bt.isDeleted) {
          await t.rollback();
          notFound(res, "Business Type not found for this subcategory.");
          return;
        }
      }

      await updateBusinessSubcategory(
        id,
        { businessTypeId, name, description, isActive },
        t
      );

      await t.commit();
      res.status(200).json({
        success: true,
        message: "Business Subcategory updated successfully.",
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[/business-subcategory/updateById/:id] ERROR:", err);
      serverError(res, err.message || "Failed to update subcategory.");
    }
  }
);

// Soft delete
router.delete("/business-subcategory/deleteBusinessSubcategoryById",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const id = Number(req.params.id);
      if (!id) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Valid id is required.",
        });
        return;
      }

      const existing = await BusinessSubcategory.findByPk(id, { transaction: t });
      if (!existing || existing.isDeleted) {
        await t.rollback();
        notFound(res, "Business Subcategory not found.");
        return;
      }

      await deleteBusinessSubcategorySoft(id, t);
      await t.commit();

      res.status(200).json({
        success: true,
        message: "Business Subcategory deleted (soft) successfully.",
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[/business-subcategory/deleteById/:id] ERROR:", err);
      serverError(res, err.message || "Failed to delete subcategory.");
    }
  }
);

 // Extra helper API:
 // GET /business-subcategory/by-type/:businessTypeId
 // for simple dropdown
router.get(
  "/business-subcategory/by-type/:businessTypeId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const businessTypeId = Number(req.params.businessTypeId);
      if (!businessTypeId) {
        res.status(400).json({
          success: false,
          message: "Valid businessTypeId is required.",
        });
        return;
      }

      const list = await getSubcategoriesByBusinessType(businessTypeId);

      res.status(200).json({
        success: true,
        message: "Business subcategories fetched for given type.",
        data: list,
      });
    } catch (err: any) {
      console.error("[/business-subcategory/by-type/:businessTypeId] ERROR:", err);
      serverError(res, err.message || "Failed to fetch subcategories by type.");
    }
  }
);

export default router;
