import express, { Request, Response } from "express";
import {
  createQuote,
  getQuoteById,
  getQuotesByCompany,
  getQuotesByClient,
  updateQuote,
  deleteQuote,
  bulkDeleteQuotes,
  convertQuoteToInvoice,
  getQuoteByPublicToken,
  getPendingQuoteAmount
} from "./quote-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";
import ErrorLogger from "../../../../db/core/logger/error-logger";

const router = express.Router();

// POST /accounting/quote/createQuote
router.post("/createQuote", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    // Validate required fields
    const {
      companyId,
      clientId,
      taxSelectionOn,
      placeOfSupply,
      quotationNo,
      items,
      showCess,
    } = req.body;

    if (!companyId || !clientId || !taxSelectionOn || !placeOfSupply || !quotationNo || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, clientId, quotationNo, items",
      });
    }

    const result = await createQuote(req.body, t);
    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Quote created successfully",
      data: result,
    });
  } catch (err) {
    await t.rollback();
    console.error("Create Quote Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to create quote.");
  }
});

// GET /accounting/quote/getQuoteById/:id?companyId=
router.get("/getQuoteById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const data = await getQuoteById(
      id,
      req.query.companyId as string
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("Get Quote Error:", err);
    return serverError(res, "Failed to fetch quote.");
  }
});

// GET /accounting/quote/getQuoteByCompanyId/:companyId
router.get("/getQuoteByCompanyId/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let companyId = req.params.companyId;
    if (Array.isArray(companyId)) companyId = companyId[0];
    const data = await getQuotesByCompany(companyId);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err) {
    console.error("Get Quotes by Company Error:", err);
    return serverError(res, "Failed to fetch quotes.");
  }
});

// GET /accounting/quote/getQuoteByClientId/:clientId?companyId=
router.get("/getQuoteByClientId/:clientId", async (req: Request, res: Response): Promise<any> => {
  try {
    let clientId = req.params.clientId;
    if (Array.isArray(clientId)) clientId = clientId[0];
    const data = await getQuotesByClient(
      clientId,
      req.query.companyId as string
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err) {
    console.error("Get Quotes by Client Error:", err);
    return serverError(res, "Failed to fetch quotes.");
  }
});

// PATCH /accounting/quote/updateQuote/:id?companyId=
router.patch("/updateQuote/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    if(req.body.items){
      const { companyId, clientId, items } = req.body;

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "companyId is required for updating purchase bill",
        });
      }

      if (items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "items array cannot be empty",
        });
      }

      // Validate items structure
      for (const item of items) {
        if (!item.itemId || !item.quantity) {
          return res.status(400).json({
            success: false,
            message: "Each item must have itemId and quantity",
          });
        }
      }
    }

    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const data = await updateQuote(
      id,
      req.query.companyId as string,
      req.body,
      t
    );

    await t.commit();
    return res.json({
      success: true,
      message: "Quote updated successfully with recalculated values",
    });
  } catch (err) {
    await t.rollback();
    console.error("Update Quote Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to update quote");
  }
});

// DELETE /accounting/quote/deleteQuote/:id?companyId=
router.delete("/deleteQuote/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const result = await deleteQuote(
      id,
      req.query.companyId as string,
      t
    );

    if (!result) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

    await t.commit();
    return res.json({
      success: true,
      message: "Quote deleted successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Delete Quote Error:", err);
    return serverError(res, "Failed to delete quote");
  }
});

// POST /accounting/quote/bulkDelete?companyId=
router.post("/bulkDelete", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.query;
    const { ids } = req.body;

    if (!companyId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "ids array is required and must not be empty",
      });
    }

    const results = await bulkDeleteQuotes(ids, companyId as string, t);

    await t.commit();

    return res.json({
      success: true,
      message: `Bulk delete completed. ${results.successful.length} deleted, ${results.failed.length} failed.`,
      data: results,
    });
  } catch (err: any) {
    await t.rollback();
    console.error("Bulk Delete Quote Error:", err);
    return serverError(res, err.message || "Failed to bulk delete quotes");
  }
});

// POST /accounting/quote/convertFromQuote/:quoteId?companyId=
router.post("/convertFromQuote/:quoteId", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.query;
    let { quoteId } = req.params;
    if (Array.isArray(quoteId)) quoteId = quoteId[0];

    if (!companyId || !quoteId) {
      return res.status(400).json({
        success: false,
        message: "companyId and quoteId are required",
      });
    }

    if (!req.body.invoiceNo || !req.body.paymentTerms) {
      return res.status(400).json({
        success: false,
        message: "invoiceNo and paymentTerms are required",
      });
    }

    const data = await convertQuoteToInvoice(
      quoteId,
      companyId as string,
      req.body,
      t
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Quote converted to invoice successfully",
      data,
    });
  } catch (err: any) {
    await t.rollback();
    return serverError(res, err.message);
  }
});

/**
 * GET /accounting/quote/getQuotePendingAmount/:clientId?companyId=
 * Calculate the pending quote amount of client in accounting
 */
router.get("/getQuotePendingAmount/:clientId", async (req: Request, res: Response): Promise<any> => {
  let companyId = req.query.companyId;
  if(Array.isArray(companyId)) companyId = companyId[0];
  let clientId = req.params.clientId;
  if(Array.isArray(clientId)) clientId = clientId[0];
  
  companyId = companyId as string;
  clientId = clientId as string;
  
  if (!clientId || !companyId) {
    return res.status(400).json({
      success: false,
      message: "clientId and companyId are required",
    });
  }
  
  const t = await dbInstance.transaction();
  try {
    const pendingAmount = await getPendingQuoteAmount(clientId, companyId);
    
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Pending amount of client calculated successfully",
      data: pendingAmount,
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "getPendingAmount for client error", error });
    return serverError(
      res,
      error?.message || "Failed to get the pending amount for client"
    );
  }
});

// GET /accounting/quote/public/:publicToken
router.get("/public/:publicToken", async (req: Request, res: Response): Promise<any> => {
  try {
    let { publicToken } = req.params;
    if (Array.isArray(publicToken)) publicToken = publicToken[0];
    const data = await getQuoteByPublicToken(publicToken);
    if (!data) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return serverError(res, "Failed to fetch quote by public token.");
  }
});

export default router;
