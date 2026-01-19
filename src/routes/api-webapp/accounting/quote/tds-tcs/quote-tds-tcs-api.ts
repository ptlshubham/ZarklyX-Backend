import express, { Request, Response } from "express";
import { QuoteTdsTcs } from "./quote-tds-tcs-model";
import {
  createQuoteTdsTcs,
  getTdsTcsByQuoteId,
  getActiveQuoteTdsTcsByCompany,
  getQuoteTdsTcsById,
  updateQuoteTdsTcs,
  deleteQuoteTdsTcs,
  bulkCreateQuoteTdsTcs,
  deleteTdsTcsByQuoteId,
} from "./quote-tds-tcs-handler";
import { serverError } from "../../../../../utils/responseHandler";
import dbInstance from "../../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/quote/tds-tcs/create
router.post("/createQuoteTdsTcs", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const data = await createQuoteTdsTcs(req.body, t);
      await t.commit();

      return res.status(201).json({
        success: true,
        message: "TDS/TCS entry created successfully",
        data,
      });
    } catch (err) {
      await t.rollback();
      console.error("Create TDS/TCS Error:", err);
      return serverError(res, "Failed to create TDS/TCS entry.");
    }
  }
);

// POST /accounting/tds-tcs/bulk-create
router.post(
  "/bulk-create",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const { entries } = req.body;
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Entries array is required and must not be empty",
        });
      }

      const data = await bulkCreateQuoteTdsTcs(entries, t);
      await t.commit();

      return res.status(201).json({
        success: true,
        message: "TDS/TCS entries created successfully",
        data,
      });
    } catch (err) {
      await t.rollback();
      console.error("Bulk Create TDS/TCS Error:", err);
      return serverError(res, "Failed to create TDS/TCS entries.");
    }
  }
);

// GET /accounting/tds-tcs/get-by-id/:id?companyId=
router.get(
  "/get-by-id/:id",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getQuoteTdsTcsById(
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

// GET /accounting/quote/tds-tcs/get-by-quote/:quoteId?companyId=
router.get(
  "/get-by-quote/:quoteId",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getTdsTcsByQuoteId(
        req.params.quoteId,
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

// GET /accounting/tds-tcs/get-by-company?companyId=
router.get(
  "/get-by-company",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getActiveQuoteTdsTcsByCompany(
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

// PATCH /accounting/tds-tcs/update/:id?companyId=
router.patch(
  "/update/:id",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const [affectedRows] = await updateQuoteTdsTcs(
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

// DELETE /accounting/tds-tcs/delete/:id?companyId=
router.delete(
  "/delete/:id",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const affectedRows = await deleteQuoteTdsTcs(
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

// DELETE /accounting/quote/tds-tcs/delete-by-quote/:quoteId?companyId=
router.delete(
  "/delete-by-quote/:quoteId",
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const affectedRows = await deleteTdsTcsByQuoteId(
        req.params.quoteId,
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
      console.error("Delete TDS/TCS by Quote Error:", err);
      return serverError(res, "Failed to delete TDS/TCS entries");
    }
  }
);

export default router;
