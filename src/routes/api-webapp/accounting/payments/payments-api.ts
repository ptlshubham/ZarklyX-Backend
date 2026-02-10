import express, { Request, Response } from "express";
import {
  createPayment,
  getPaymentById,
  getPaymentsByCompany,
  getPaymentsByClient,
  getPaymentsByVendor,
  getUnpaidInvoices,
  getUnpaidPurchaseBills,
  updatePayment,
  deletePayment,
  searchPayments,
  getPaymentStatistics,
  getPaymentsForInvoice,
  getInvoicesForPayment,
  getPaymentsForPurchaseBill,
  getPurchaseBillsForPayment,
} from "./payments-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";
import { PaymentsDocuments } from "./payments-documents-model";

const router = express.Router();

// POST /accounting/payments/createPayment
router.post("/createPayment", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const {
      companyId,
      paymentType,
      paymentNo,
      paymentAmount,
      referenceNo,
      method,
      documents,
    } = req.body;

    // Validate required fields
    if (!companyId || !paymentType || !paymentNo || !paymentAmount || !method) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: companyId, paymentType, paymentNo, paymentAmount, method",
      });
    }

    // Validate documents array
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "documents array is required and must not be empty",
      });
    }

    // Validate payment type
    const validPaymentTypes = [
      "Payment Made",
      "Payment Received",
      "Advance Payment Received",
      "Advance Payment Made",
    ];

    if (!validPaymentTypes.includes(paymentType)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid payment type. Must be one of: ${validPaymentTypes.join(", ")}`,
      });
    }

    // Validate payment type specific requirements
    if (
      (paymentType === "Payment Received" ||
        paymentType === "Advance Payment Received") &&
      !req.body.clientId
    ) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "clientId is required for Payment Received or Advance Payment Received",
      });
    }

    if (
      (paymentType === "Payment Made" || paymentType === "Advance Payment Made") &&
      !req.body.vendorId
    ) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "vendorId is required for Payment Made or Advance Payment Made",
      });
    }

    const payment = await createPayment(req.body, t);
    await t.commit();

    // Fetch linked documents for receipt
    const linkedDocs = await PaymentsDocuments.findAll({
      where: { paymentId: payment.id },
    });

    return res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: {
        ...payment.toJSON(),
        documents: linkedDocs,
      },
    });
  } catch (err: any) {
    await t.rollback();
    console.error("Create Payment Error:", err);
    return serverError(res, err.message || "Failed to create payment.");
  }
});

// PATCH /accounting/payments/updatePayment/:id?companyId=
router.patch("/updatePayment/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.query;

    if (!companyId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    // Validate documents array
    if (
      req.body.documents &&
      (!Array.isArray(req.body.documents) || req.body.documents.length === 0)
    ) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "documents array must not be empty if provided",
      });
    }
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];

    const success = await updatePayment(
      id,
      companyId as string,
      req.body,
      t
    );

    if (!success) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    await t.commit();

    // Fetch updated payment with documents
    const linkedDocs = await PaymentsDocuments.findAll({
      where: { paymentId: id },
    });

    return res.json({
      success: true,
      message: "Payment updated successfully",
      data: { documents: linkedDocs },
    });
  } catch (err: any) {
    await t.rollback();
    console.error("Update Payment Error:", err);
    return serverError(res, err.message || "Failed to update payment");
  }
});

// DELETE /accounting/payments/deletePayment/:id?companyId=
router.delete("/deletePayment/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.query;

    if (!companyId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];


    const success = await deletePayment(id, companyId as string, t);

    if (!success) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    await t.commit();
    return res.json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (err: any) {
    await t.rollback();
    console.error("Delete Payment Error:", err);
    return serverError(res, err.message || "Failed to delete payment");
  }
});

// GET /accounting/payments/getPaymentById/:id?companyId=
router.get("/getPaymentById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];

    const data = await getPaymentById(id, companyId as string);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.error("Get Payment By ID Error:", err);
    return serverError(res, "Failed to fetch payment.");
  }
});

// GET /accounting/payments/getPaymentsByCompany?companyId=
router.get("/getPaymentsByCompany", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    const data = await getPaymentsByCompany(companyId as string);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Get Payments By Company Error:", err);
    return serverError(res, "Failed to fetch payments.");
  }
});

// GET /accounting/payments/getPaymentsByClient/:clientId?companyId=
router.get("/getPaymentsByClient/:clientId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }
    let clientId = req.params.clientId;
    if (Array.isArray(clientId)) clientId = clientId[0];

    const data = await getPaymentsByClient(
      clientId,
      companyId as string
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Get Payments By Client Error:", err);
    return serverError(res, "Failed to fetch payments.");
  }
});

// GET /accounting/payments/getPaymentsByVendor/:vendorId?companyId=
router.get("/getPaymentsByVendor/:vendorId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    let vendorId = req.params.vendorId;
    if (Array.isArray(vendorId)) vendorId = vendorId[0];

    const data = await getPaymentsByVendor(
      vendorId,
      companyId as string
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Get Payments By Vendor Error:", err);
    return serverError(res, "Failed to fetch payments.");
  }
});

// GET /accounting/payments/getUnpaidInvoices/:clientId?companyId=
router.get("/getUnpaidInvoices/:clientId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    let clientId = req.params.clientId;
    if (Array.isArray(clientId)) clientId = clientId[0];

    const data = await getUnpaidInvoices(clientId, companyId as string);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Get Unpaid Invoices Error:", err);
    return serverError(res, "Failed to fetch unpaid invoices.");
  }
});

// GET /accounting/payments/getUnpaidPurchaseBills/:vendorId?companyId=
router.get("/getUnpaidPurchaseBills/:vendorId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    let vendorId = req.params.vendorId;
    if (Array.isArray(vendorId)) vendorId = vendorId[0];

    const data = await getUnpaidPurchaseBills(
      vendorId,
      companyId as string
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Get Unpaid Purchase Bills Error:", err);
    return serverError(res, "Failed to fetch unpaid purchase bills.");
  }
});

// GET /accounting/payments/searchPayments?companyId=...&paymentType=...&method=...
router.get("/searchPayments", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    // Build filters object from query params
    const filters: any = {
      companyId: companyId as string,
    };

    if (req.query.paymentType) {
      filters.paymentType = req.query.paymentType as string;
    }

    if (req.query.clientId) {
      filters.clientId = req.query.clientId as string;
    }

    if (req.query.vendorId) {
      filters.vendorId = req.query.vendorId as string;
    }

    if (req.query.paymentNo) {
      filters.paymentNo = req.query.paymentNo as string;
    }

    if (req.query.method) {
      filters.method = req.query.method as string;
    }

    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    if (req.query.paymentDateFrom) {
      filters.paymentDateFrom = new Date(req.query.paymentDateFrom as string);
    }

    if (req.query.paymentDateTo) {
      filters.paymentDateTo = new Date(req.query.paymentDateTo as string);
    }

    if (req.query.minAmount) {
      filters.minAmount = parseFloat(req.query.minAmount as string);
    }

    if (req.query.maxAmount) {
      filters.maxAmount = parseFloat(req.query.maxAmount as string);
    }

    const data = await searchPayments(filters);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Search Payments Error:", err);
    return serverError(res, err.message || "Failed to search payments.");
  }
});

// GET /accounting/payments/getPaymentsForInvoice/:invoiceId?companyId=
router.get("/getPaymentsForInvoice/:invoiceId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    let invoiceId = req.params.invoiceId;
    if (Array.isArray(invoiceId)) invoiceId = invoiceId[0];

    const data = await getPaymentsForInvoice(invoiceId, companyId as string);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("Get Payments For Invoice Error:", err);
    return serverError(res, "Failed to fetch payments for invoice.");
  }
});

// GET /accounting/payments/getInvoicesForPayment/:paymentId
router.get("/getInvoicesForPayment/:paymentId", async (req: Request, res: Response): Promise<any> => {
  try {
    let paymentId = req.params.paymentId;
    if (Array.isArray(paymentId)) paymentId = paymentId[0];

    const data = await getInvoicesForPayment(paymentId);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("Get Invoices For Payment Error:", err);
    return serverError(res, "Failed to fetch invoices for payment.");
  }
});

// GET /accounting/payments/getPaymentsForPurchaseBill/:purchaseBillId?companyId=
router.get("/getPaymentsForPurchaseBill/:purchaseBillId", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    let purchaseBillId = req.params.purchaseBillId;
    if (Array.isArray(purchaseBillId)) purchaseBillId = purchaseBillId[0];

    const data = await getPaymentsForPurchaseBill(purchaseBillId, companyId as string);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("Get Payments For Purchase Bill Error:", err);
    return serverError(res, "Failed to fetch payments for purchase bill.");
  }
});

// GET /accounting/payments/getPurchaseBillsForPayment/:paymentId
router.get("/getPurchaseBillsForPayment/:paymentId", async (req: Request, res: Response): Promise<any> => {
  try {
    let paymentId = req.params.paymentId;
    if (Array.isArray(paymentId)) paymentId = paymentId[0];

    const data = await getPurchaseBillsForPayment(paymentId);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("Get Purchase Bills For Payment Error:", err);
    return serverError(res, "Failed to fetch purchase bills for payment.");
  }
});

// GET /accounting/payments/getPaymentStatistics?companyId=
router.get("/getPaymentStatistics", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId query parameter is required",
      });
    }

    const data = await getPaymentStatistics(companyId as string);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error("Get Payment Statistics Error:", err);
    return serverError(res, "Failed to fetch payment statistics.");
  }
});

export default router;
