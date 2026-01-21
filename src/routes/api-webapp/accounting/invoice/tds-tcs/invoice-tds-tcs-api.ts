import express, { Request, Response } from "express";
import { InvoiceTdsTcs } from "./invoice-tds-tcs-model";
import {
  createInvoiceTdsTcs,
  getTdsTcsByInvoiceId,
  getActiveInvoiceTdsTcsByCompany,
  getTdsTcsById,
  updateTdsTcs,
  deleteTdsTcs,
  bulkCreateTdsTcs,
  deleteTdsTcsByInvoiceId,
} from "./invoice-tds-tcs-handler";
import { serverError } from "../../../../../utils/responseHandler";
import dbInstance from "../../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/invoice/tds-tcs/createInvoiceTdsTcs
router.post("/createInvoiceTdsTcs", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const data = await createInvoiceTdsTcs(req.body, t);
      await t.commit();

      return res.status(201).json({
        success: true,
        message: "Invoice TDS/TCS entry created successfully",
        data,
      });
    } catch (err) {
      await t.rollback();
      console.error("Create Invoice TDS/TCS Error:", err);
      return serverError(res, "Failed to create Invoice TDS/TCS entry.");
    }
  }
);

// POST /accounting/invoice/tds-tcs/bulkCreateInvoiceTdsTcs
router.post("/bulkCreateInvoiceTdsTcs", async (req: Request, res: Response): Promise<any> => {
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
        message: "Invoice TDS/TCS entries created successfully",
        data,
      });
    } catch (err) {
      await t.rollback();
      console.error("Bulk Create Invoice TDS/TCS Error:", err);
      return serverError(res, "Failed to create Invoice TDS/TCS entries.");
    }
  }
);

// GET /accounting/invoice/tds-tcs/getTdsTcsById/:id?companyId=
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

// GET /accounting/invoice/tds-tcs/getInvoiceTdsTcsById/:invoiceId?companyId=
router.get("/getInvoiceTdsTcsById/:invoiceId", async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getTdsTcsByInvoiceId(
        req.params.invoiceId,
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

// GET /accounting/invoice/tds-tcs/getInvoiceTdsTcsByCompanyId?companyId=
router.get("/getInvoiceTdsTcsByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getActiveInvoiceTdsTcsByCompany(
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

// PATCH /accounting/invoice/tds-tcs/updateInvoiceTdsTcs/:id?companyId=
router.patch("/updateInvoiceTdsTcs/:id", async (req: Request, res: Response): Promise<any> => {
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

// DELETE /accounting/invoice/tds-tcs/deleteInvoiceTdsTcs/:id?companyId=
router.delete("/deleteInvoiceTdsTcs/:id", async (req: Request, res: Response): Promise<any> => {
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

// DELETE /accounting/tds-tcs/invoice/deleteInvoiceTdsTcsByInvoiceId/:invoiceId?companyId=
router.delete("/deleteInvoiceTdsTcsByInvoiceId/:invoiceId", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      const affectedRows = await deleteTdsTcsByInvoiceId(
        req.params.invoiceId,
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
      console.error("Delete TDS/TCS by Invoice Error:", err);
      return serverError(res, "Failed to delete TDS/TCS entries");
    }
  }
);

export default router;
