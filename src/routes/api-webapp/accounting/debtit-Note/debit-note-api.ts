import express, { Request, Response } from "express";
import {
  createDebitNote,
  getDebitNoteById,
  getDebitNotesByCompany,
  getDebitNotesByClient,
  getDebitNotesByVendor,
  getDebitNotesByInvoice,
  getDebitNotesByPurchaseBill,
  updateDebitNote,
  deleteDebitNote,
  searchDebitNote,
} from "./debit-note-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/debit-note/createDebitNote
router.post("/createDebitNote", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    // Validate required fields
    const {
      companyId,
      placeOfSupply,
      creditNo,
      reason,
      items,
      showCess,
    } = req.body;

    if (!companyId || !creditNo || !reason || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, creditNo (debitNo), reason, items",
      });
    }

    // Validate that either clientId+invoiceId or vendorId+purchaseBillId is provided
    const hasClientInfo = req.body.clientId && req.body.invoiceId;
    const hasVendorInfo = req.body.vendorId && req.body.purchaseBillId;

    if (!hasClientInfo && !hasVendorInfo) {
      return res.status(400).json({
        success: false,
        message: "Either (clientId + invoiceId) for invoice-based debit note OR (vendorId + purchaseBillId) for purchase bill-based debit note must be provided",
      });
    }

    if (hasClientInfo && hasVendorInfo) {
      return res.status(400).json({
        success: false,
        message: "Cannot provide both client and vendor information. Debit note must be for either client or vendor",
      });
    }

    const result = await createDebitNote(req.body, t);
    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Debit note created successfully",
      data: result,
    });
  } catch (err) {
    await t.rollback();
    console.error("Create Debit Note Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to create debit note.");
  }
});

// GET /accounting/debit-note/getDebitNoteById/:id?companyId=
router.get("/getDebitNoteById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const debitNote = await getDebitNoteById(id, companyId as string);

    if (!debitNote) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: debitNote,
    });
  } catch (err) {
    console.error("Get Debit Note By ID Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch debit note.");
  }
});

// GET /accounting/debit-note/getDebitNoteByCompanyId/:companyId
router.get("/getDebitNoteByCompanyId/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let companyId = req.params.companyId;
    if (Array.isArray(companyId)) companyId = companyId[0];

    const debitNotes = await getDebitNotesByCompany(companyId);

    return res.status(200).json({
      success: true,
      data: debitNotes,
    });
  } catch (err) {
    console.error("Get Debit Notes By Company Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch debit notes.");
  }
});

// GET /accounting/debit-note/getDebitNoteByClientId/:clientId?companyId=
router.get("/getDebitNoteByClientId/:clientId", async (req: Request, res: Response): Promise<any> => {
  try {
    let clientId = req.params.clientId;
    if (Array.isArray(clientId)) clientId = clientId[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const debitNotes = await getDebitNotesByClient(clientId, companyId as string);

    return res.status(200).json({
      success: true,
      data: debitNotes,
    });
  } catch (err) {
    console.error("Get Debit Notes By Client Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch debit notes.");
  }
});

// GET /accounting/debit-note/getDebitNoteByVendorId/:vendorId?companyId=
router.get("/getDebitNoteByVendorId/:vendorId", async (req: Request, res: Response): Promise<any> => {
  try {
    let vendorId = req.params.vendorId;
    if (Array.isArray(vendorId)) vendorId = vendorId[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const debitNotes = await getDebitNotesByVendor(vendorId, companyId as string);

    return res.status(200).json({
      success: true,
      data: debitNotes,
    });
  } catch (err) {
    console.error("Get Debit Notes By Vendor Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch debit notes.");
  }
});

// GET /accounting/debit-note/getDebitNoteByInvoiceId/:invoiceId?companyId=
router.get("/getDebitNoteByInvoiceId/:invoiceId", async (req: Request, res: Response): Promise<any> => {
  try {
    let invoiceId = req.params.invoiceId;
    if (Array.isArray(invoiceId)) invoiceId = invoiceId[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const debitNotes = await getDebitNotesByInvoice(invoiceId, companyId as string);

    return res.status(200).json({
      success: true,
      data: debitNotes,
    });
  } catch (err) {
    console.error("Get Debit Notes By Invoice Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch debit notes.");
  }
});

// GET /accounting/debit-note/getDebitNoteByPurchaseBillId/:purchaseBillId?companyId=
router.get("/getDebitNoteByPurchaseBillId/:purchaseBillId", async (req: Request, res: Response): Promise<any> => {
  try {
    let purchaseBillId = req.params.purchaseBillId;
    if (Array.isArray(purchaseBillId)) purchaseBillId = purchaseBillId[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const debitNotes = await getDebitNotesByPurchaseBill(purchaseBillId, companyId as string);

    return res.status(200).json({
      success: true,
      data: debitNotes,
    });
  } catch (err) {
    console.error("Get Debit Notes By Purchase Bill Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to fetch debit notes.");
  }
});

// PUT /accounting/debit-note/updateDebitNote/:id?companyId=
router.put("/updateDebitNote/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    // Validate required fields
    const { reason, items } = req.body;

    if (!reason || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: reason, items",
      });
    }

    const result = await updateDebitNote(id, companyId as string, req.body, t);
    await t.commit();

    if (result[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Debit note updated successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Update Debit Note Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to update debit note.");
  }
});

// DELETE /accounting/debit-note/deleteDebitNote/:id?companyId=
router.delete("/deleteDebitNote/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    const result = await deleteDebitNote(id, companyId as string, t);
    await t.commit();

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Debit note not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Debit note deleted successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Delete Debit Note Error:", err);
    return serverError(res, err instanceof Error ? err.message : "Failed to delete debit note.");
  }
});

// GET /accounting/debit-note/searchDebitNote/?companyId=...&clientName=...&vendorName=...&creditNo=...&status=...&city=...&type=...&itemName=...&amountFrom=...&amountTo=...&creditDateFrom=...&creditDateTo=...
router.get("/searchDebitNote", async (req: Request, res: Response): Promise<any> => {
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

    if (req.query.vendorName) {
      filters.vendorName = req.query.vendorName as string;
    }

    if (req.query.debitNo) {
      filters.debitNo = req.query.debitNo as string;
    }

    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    if (req.query.city) {
      filters.city = req.query.city as string;
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

    if (req.query.debitDateFrom) {
      filters.debitDateFrom = new Date(req.query.debitDateFrom as string);
    }

    if (req.query.debitDateTo) {
      filters.debitDateTo = new Date(req.query.debitDateTo as string);
    }

    const data = await searchDebitNote(filters);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Search Debit Note Error:", err);
    return serverError(res, err.message || "Failed to search debit note.");
  }
});

export default router;
