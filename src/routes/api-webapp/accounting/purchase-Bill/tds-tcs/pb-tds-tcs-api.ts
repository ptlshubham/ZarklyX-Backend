import express, { Request, Response } from "express";
import { PurchaseBillTdsTcs } from "./pb-tds-tcs-model";
import {
  createPBTdsTcs,
  getTdsTcsByPBId,
  getActivePBTdsTcsByCompanyId,
  getTdsTcsById,
  updateTdsTcs,
  deleteTdsTcs,
  bulkCreateTdsTcs,
  deleteTdsTcsByPBId,
} from "./pb-tds-tcs-handler";
import { serverError } from "../../../../../utils/responseHandler";
import dbInstance from "../../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/purchase-Bill/tds-tcs/createPBTdsTcs
router.post("/createPBTdsTcs", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const data = await createPBTdsTcs(req.body, t);
      await t.commit();

      return res.status(201).json({
        success: true,
        message: "Purchase bill TDS/TCS entry created successfully",
        data,
      });
    } catch (err) {
      await t.rollback();
      console.error("Create Purchase Bill TDS/TCS Error:", err);
      return serverError(res, "Failed to create Purchase Bill TDS/TCS entry.");
    }
  }
);

// POST /accounting/purchase-Bill/tds-tcs/bulkCreatePBTdsTcs
router.post("/bulkCreatePBTdsTcs", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const { entries } = req.body;
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Entries array is required and must not be empty",
        });
      }

      const data = await bulkCreateTdsTcs(entries, t);
      await t.commit();

      return res.status(201).json({
        success: true,
        message: "Purchase bill TDS/TCS entries created successfully",
        data,
      });
    } catch (err) {
      await t.rollback();
      console.error("Bulk Create Purchase bill TDS/TCS Error:", err);
      return serverError(res, "Failed to create Purchase bill TDS/TCS entries.");
    }
  }
);

// GET /accounting/purchase-Bill/tds-tcs/getTdsTcsById/:id?companyId=
router.get("/getTdsTcsById/:id", async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getTdsTcsById(
        req.params.id,
        req.query.companyId as string
      );

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "TDS/TCS entry not found",
        });
      }

      res.json({ success: true, data });
    } catch (err) {
      return serverError(res, "Failed to fetch TDS/TCS entry.");
    }
  }
);

// GET /accounting/purchase-Bill/tds-tcs/getTdsTcsByPBId/:pbId?companyId=
router.get("/getTdsTcsByPBId/:pbId", async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getTdsTcsByPBId(
        req.params.pbId,
        req.query.companyId as string
      );

      res.json({ 
        success: true, 
        data,
        count: data.length 
      });
    } catch (err) {
      return serverError(res, "Failed to fetch TDS/TCS entries.");
    }
  }
);

// GET /accounting/purchase-Bill/tds-tcs/getActivePBTdsTcsByCompanyId?companyId=
router.get("/getActivePBTdsTcsByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getActivePBTdsTcsByCompanyId(
        req.query.companyId as string
      );
      
      res.json({ 
        success: true, 
        data,
        count: data.length 
      });
    } catch (err) {
      return serverError(res, "Failed to fetch TDS/TCS entries.");
    }
  }
);

// PATCH /accounting/purchase-Bill/tds-tcs/updatePBTdsTcs/:id?companyId=
router.patch("/updatePBTdsTcs/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const [affectedRows] = await updateTdsTcs(
        req.params.id,
        req.query.companyId as string,
        req.body,
        t
      );

      if (affectedRows === 0) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: "TDS/TCS entry not found",
        });
      }

      await t.commit();
      return res.json({
        success: true,
        message: "TDS/TCS entry updated successfully",
      });
    } catch (err) {
      await t.rollback();
      console.error("Update TDS/TCS Error:", err);
      return serverError(res, "Failed to update TDS/TCS entry");
    }
  }
);

// DELETE /accounting/purchase-Bill/tds-tcs/deletePbTdsTcs/:id?companyId=
router.delete("/deletePbTdsTcs/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const affectedRows = await deleteTdsTcs(
        req.params.id,
        req.query.companyId as string,
        t
      );

      if (affectedRows === 0) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: "TDS/TCS entry not found",
        });
      }

      await t.commit();
      return res.json({
        success: true,
        message: "TDS/TCS entry deleted successfully",
      });
    } catch (err) {
      await t.rollback();
      console.error("Delete TDS/TCS Error:", err);
      return serverError(res, "Failed to delete TDS/TCS entry");
    }
  }
);

// DELETE /accounting/tds-tcs/purchase-Bill/deleteTdsTcsByPBId/:pbId?companyId=
router.delete("/deleteTdsTcsByPBId/:pbId", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const affectedRows = await deleteTdsTcsByPBId(
        req.params.pbId,
        req.query.companyId as string,
        t
      );

      await t.commit();
      return res.json({
        success: true,
        message: `${affectedRows} TDS/TCS entries deleted successfully`,
        count: affectedRows,
      });
    } catch (err) {
      await t.rollback();
      console.error("Delete TDS/TCS by Purchase Bill Error:", err);
      return serverError(res, "Failed to delete TDS/TCS entries");
    }
  }
);

export default router;
