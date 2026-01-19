import express, { Request, Response } from "express";
import {
  createQuote,
  getQuoteById,
  getQuotesByCompany,
  getQuotesByClient,
  updateQuote,
  deleteQuote,
  convertQuoteToInvoice,
} from "./quote-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

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

    if (!companyId || !clientId || !quotationNo || !items || items.length === 0) {
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
    // Validate required fields for update
    const {
      companyId,
      clientId,
      taxSelectionOn,
      placeOfSupply,
      quotationNo,
      items,
      showCess,
    } = req.body;

    if (!companyId || !clientId || !quotationNo || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, clientId, quotationNo, items",
      });
    }

    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const [affectedRows] = await updateQuote(
      id,
      req.query.companyId as string,
      req.body,
      t
    );

    if (affectedRows === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Quote not found",
      });
    }

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
    const [affectedRows] = await deleteQuote(
      id,
      req.query.companyId as string,
      t
    );

    if (affectedRows === 0) {
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

// POST /accounting/quote/convert-from-quote/:quoteId?companyId=
router.post("/convertFromQuote/:quoteId", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.query;
    let { quoteId } = req.params;
    if (Array.isArray(quoteId)) quoteId = quoteId[0];
    const {
      invoiceType,
      invoiceNo,
      invoiceDate,
      poNo,
      poDate,
      paymentTerms,
      specificDueDate,
    } = req.body;

    if (!companyId || !quoteId) {
      return res.status(400).json({
        success: false,
        message: "companyId and quoteId are required",
      });
    }

    if (!invoiceType || !invoiceNo || !poNo || !paymentTerms) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: invoiceType, invoiceNo, poNo, paymentTerms",
      });
    }

    // Validate payment terms
    const validPaymentTerms = [
      "specific date",
      "hide payment terms",
      "NET 7",
      "NET 10",
      "NET 15",
      "NET 30",
      "NET 45",
      "NET 60",
    ];

    if (!validPaymentTerms.includes(paymentTerms)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment terms. Must be one of: ${validPaymentTerms.join(", ")}`,
      });
    }

    const data = await convertQuoteToInvoice(
      quoteId,
      companyId as string,
      {
        invoiceType,
        invoiceNo,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
        poNo,
        poDate: poDate ? new Date(poDate) : undefined,
        paymentTerms,
        specificDueDate: specificDueDate ? new Date(specificDueDate) : undefined,
      },
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
    console.error("Convert Quote to Invoice Error:", err);
    return serverError(res, err.message || "Failed to convert quote to invoice.");
  }
});

export default router;
