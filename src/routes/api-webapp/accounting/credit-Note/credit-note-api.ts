import express, { Request, Response } from "express";
import {
  createCreditNote,
  getCreditNoteById,
  getCreditNotesByCompany,
  getCreditNotesByClient,
  getCreditNotesByInvoice,
  updateCreditNote,
  deleteCreditNote,
  searchCreditNote,
  getCreditNoteByPublicToken
} from "./credit-note-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/credit-note/createCreditNote
router.post("/createCreditNote", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    // Validate required fields
    const {
      companyId,
      clientId,
      taxSelectionOn,
      placeOfSupply,
      creditNo,
      invoiceId,
      reason,
      items,
      showCess,
    } = req.body;

    if (!companyId || !clientId || !creditNo || !invoiceId || !reason || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, clientId, creditNo, invoiceId, reason, items",
      });
    }

    const result = await createCreditNote(req.body, t);
    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Credit note created successfully",
      data: result,
    });
  } catch (err) {
    await t.rollback();
    console.error("Create Credit Note Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to create credit note.");
  }
});

// GET /accounting/credit-note/getCreditNoteById/:id?companyId=
router.get("/getCreditNoteById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const creditNote = await getCreditNoteById(id, companyId as string);

    if (!creditNote) {
      return res.status(404).json({
        success: false,
        message: "Credit note not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: creditNote,
    });
  } catch (err) {
    console.error("Get Credit Note By ID Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch credit note.");
  }
});

// GET /accounting/credit-note/getCreditNoteByCompanyId/:companyId
router.get("/getCreditNoteByCompanyId/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.params;
    if (Array.isArray(companyId)) companyId = companyId[0];

    const creditNotes = await getCreditNotesByCompany(companyId);

    return res.status(200).json({
      success: true,
      data: creditNotes,
    });
  } catch (err) {
    console.error("Get Credit Notes By Company Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch credit notes.");
  }
});

// GET /accounting/credit-note/getCreditNoteByClientId/:clientId?companyId=
router.get("/getCreditNoteByClientId/:clientId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { clientId } = req.params;
    if (Array.isArray(clientId)) clientId = clientId[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const creditNotes = await getCreditNotesByClient(clientId, companyId as string);

    return res.status(200).json({
      success: true,
      data: creditNotes,
    });
  } catch (err) {
    console.error("Get Credit Notes By Client Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch credit notes.");
  }
});

// GET /accounting/credit-note/getCreditNoteByInvoiceId/:invoiceId
router.get("/getCreditNoteByInvoiceId/:invoiceId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { invoiceId } = req.params;
    if (Array.isArray(invoiceId)) invoiceId = invoiceId[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const creditNotes = await getCreditNotesByInvoice(invoiceId, companyId as string);

    return res.status(200).json({
      success: true,
      data: creditNotes,
    });
  } catch (err) {
    console.error("Get Credit Notes By Invoice Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch credit notes.");
  }
});

// GET /accounting/credit-note/searchCreditNote/?companyId=...&clientName=...&creditNo=...&status=...&city=...&type=...&itemName=...&amountFrom=...&amountTo=...&creditDateFrom=...&creditDateTo=...
router.get("/searchCreditNote", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    // Build filters object from query params
    const filters: any = {
      companyId: companyId as string,
    };

    if (req.query.clientName) {
      filters.clientName = req.query.clientName as string;
    }

    if (req.query.creditNo) {
      filters.creditNo = req.query.creditNo as string;
    }

    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    if (req.query.city) {
      filters.city = req.query.city as string;
    }

    if (req.query.type) {
      filters.type = req.query.type as string;
    }

    if (req.query.itemName) {
      filters.itemName = req.query.itemName as string;
    }

    if (req.query.amountFrom) {
      filters.amountFrom = req.query.amountFrom as string;
    }

    if (req.query.amountTo) {
      filters.amountTo = req.query.amountTo as string;
    }

    if (req.query.creditDateFrom) {
      filters.creditDateFrom = new Date(req.query.creditDateFrom as string);
    }

    if (req.query.creditDateTo) {
      filters.creditDateTo = new Date(req.query.creditDateTo as string);
    }

    const data = await searchCreditNote(filters);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Search Credit Note Error:", err);
    return serverError(res, err.message || "Failed to search credit note.");
  }
});

// PUT /accounting/credit-note/updateCreditNote/:id
router.put("/updateCreditNote/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    const {
      companyId,
      clientId,
      taxSelectionOn,
      placeOfSupply,
      creditNo,
      invoiceId,
      reason,
      items,
      showCess,
    } = req.body;

    if (!companyId || !clientId || !creditNo || !invoiceId || !reason || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, clientId, creditNo, invoiceId, reason, items",
      });
    }

    const result = await updateCreditNote(id, companyId, req.body, t);
    await t.commit();

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Credit note not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Credit note updated successfully with recalculated values",
    });
  } catch (err) {
    await t.rollback();
    console.error("Update Credit Note Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to update credit note.");
  }
});

// DELETE /accounting/credit-note/deleteCreditNote/:id
router.delete("/deleteCreditNote/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const result = await deleteCreditNote(id, companyId as string, t);
    await t.commit();

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Credit note not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Credit note deleted successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Delete Credit Note Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to delete credit note.");
  }
});

// GET /accounting/credit-note/public/:publicToken
router.get("/public/:publicToken", async (req: Request, res: Response): Promise<any> => {
  try {
    let { publicToken } = req.params;
    if (Array.isArray(publicToken)) publicToken = publicToken[0];
    const data = await getCreditNoteByPublicToken(publicToken);
    if (!data) {
      return res.status(404).json({ success: false, message: "Credit note not found" });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return serverError(res, "Failed to fetch credit note by public token.");
  }
});

export default router;
