import express from "express";
import asyncHandler from "express-async-handler";
import dbInstance from "../../../../db/core/control-db";
import { serverError } from "../../../../utils/responseHandler";
import {
  createWarehouse,
  getAllWarehouse,
  getWarehouseById,
  updateWarehouse,
  softDeleteWarehouse,
} from "./warehouse-handler";
import { systemLog } from "../../../../middleware/system-log.middleware";
import { authMiddleware } from "../../../../middleware/auth.middleware";

const router = express.Router();

// add Warehouse

router.post(
  "/addWarehouse",
  authMiddleware,
  systemLog({
    module: "WAREHOUSE",
    operation: "CREATE",
    action: "Add Warehouse",
    metadata: {
      description: "Added a new warehouse",
    }
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const { companyId, warehouse } = req.body;

      if (!companyId) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "companyId is required.",
          field: "companyId",
        });
        return;
      }

      if (!Array.isArray(warehouse) || warehouse.length === 0) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Warehouse array is required.",
          field: "warehouse",
        });
        return;
      }

      //const data = await createWarehouse(companyId, warehouse, t);

      const data = [];
      for (const wh of warehouse) {
        const created = await createWarehouse(companyId, wh, t);
        data.push(created);
      }

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Warehouse added successfully.",
        data,
      });
    } catch (error: any) {
      await t.rollback();
      console.error("Warehouse add Error:", error);

      if (error.name === "SequelizeUniqueConstraintError") {
        res.status(409).json({
          success: false,
          message: "Warehouse name or code already exists for this company.",
        });
        return;
      }

      serverError(res, "Something went wrong during warehouse creation.");
    }
  })
);

// get all Warehouse by company id

router.get(
  "/getAllWarehouse/:companyId",
  asyncHandler(async (req, res) => {
    try {
      let { companyId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}

      const data = await getAllWarehouse(companyId);

      res.status(200).json({
        success: true,
        message: "Warehouse retrieved successfully.",
        data,
      });
    } catch (error) {
      console.error("Warehouse getAll Error:", error);
      serverError(res, "Something went wrong during warehouse retrieval.");
    }
  })
);

// get Warehouse by id

router.get(
  "/getWarehouseById/:id/:companyId",
  asyncHandler(async (req, res) => {
    try {
      let { id, companyId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}
      if(Array.isArray(id)){id=id[0];}
      const data = await getWarehouseById(id, companyId);

      if (!data) {
        res.status(404).json({
          success: false,
          message: "Warehouse not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Warehouse retrieved successfully.",
        data,
      });
    } catch (error) {
      console.error("Warehouse getById Error:", error);
      serverError(res, "Something went wrong during warehouse retrieval.");
    }
  })
);

// update Warehouse by id

router.post(
  "/updateWarehouseById",
  authMiddleware,
  systemLog({
    module: "WAREHOUSE",
    operation: "UPDATE",
    action: "Update Warehouse",
    metadata: {
      description: "Updated warehouse details",
    }
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const { id, companyId, name, code, address ,isActive} = req.body;

      if (!id || !companyId) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "id and companyId are required.",
        });
        return;
      }

      const existing = await getWarehouseById(id, companyId);
      if (!existing) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Warehouse not found.",
        });
        return;
      }

      const data = await updateWarehouse(
        id,
        companyId,
        { name, code, address, isActive },
        t
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Warehouse updated successfully.",
        data,
      });
    } catch (error: any) {
      await t.rollback();
      console.error("Warehouse update Error:", error);

      if (error.name === "SequelizeUniqueConstraintError") {
        res.status(409).json({
          success: false,
          message: "Warehouse name or code already exists for this company.",
        });
        return;
      }

      serverError(res, "Something went wrong during warehouse update.");
    }
  })
);

// soft delete Warehouse

router.get(
  "/removeWarehouseById/:id/:companyId",
  authMiddleware,
  systemLog({
    module: "WAREHOUSE",
    operation: "DELETE",
    action: "Delete Warehouse",
    metadata: {
      description: "Soft deleted a warehouse",
    }
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      let { id, companyId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}
      if(Array.isArray(id)){id=id[0];}

      const data = await softDeleteWarehouse(id, companyId, t);
      await t.commit();

      res.status(200).json({
        success: true,
        message: "Warehouse deleted successfully.",
        data,
      });
    } catch (error) {
      await t.rollback();
      console.error("Warehouse delete Error:", error);
      serverError(res, "Something went wrong during warehouse delete.");
    }
  })
);

export default router;
