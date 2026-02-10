import express, { Request, Response } from "express";
import {
  createInvoice,
  getInvoiceById,
  getInvoicesByCompany,
  getInvoicesByClient,
  updateInvoice,
  deleteInvoice,
  searchInvoices,
  convertInvoiceToPayment,
  getInvoiceByPublicToken,
  getPendingInvoiceAmount,
} from "./invoice-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";
import { Company } from "../../../../routes/api-webapp/company/company-model";
import ErrorLogger from "../../../../db/core/logger/error-logger";

const router = express.Router();

// POST /accounting/invoice/create
router.post("/createInvoice", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    // Comprehensive manual validation
    const requiredFields = [
      "companyId",
      "invoiceType",
      "clientId",
      "taxSelectionOn",
      "placeOfSupply",
      "invoiceNo",
      "invoiceDate",
      "poNo",
      "poDate",
      "paymentTerms",
      "items",
      "showCess",
      "reverseCharge"
    ];
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "") {
        return res.status(400).json({
          success: false,
          message: `Missing or empty required field: ${field}`,
        });
      }
    }
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items must be a non-empty array",
      });
    }
    for (const [i, item] of req.body.items.entries()) {
      if (!item.itemId || typeof item.itemId !== "string") {
        return res.status(400).json({
          success: false,
          message: `items[${i}].itemId is required and must be a string`,
        });
      }
      if (item.quantity === undefined || item.quantity === null || isNaN(item.quantity)) {
        return res.status(400).json({
          success: false,
          message: `items[${i}].quantity is required and must be a number`,
        });
      }
    }
    // Validate paymentTerms
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
    if (!validPaymentTerms.includes(req.body.paymentTerms)) {
      return res.status(400).json({
        success: false,
        message: `Invalid paymentTerms. Must be one of: ${validPaymentTerms.join(", ")}`,
      });
    }
    if (req.body.paymentTerms === "specific date" && !req.body.specificDueDate) {
      return res.status(400).json({
        success: false,
        message: 'specificDueDate is required when paymentTerms is "specific date"',
      });
    }
    // Optionally validate tdsTcsEntries
    if (req.body.tdsTcsEntries) {
      if (!Array.isArray(req.body.tdsTcsEntries)) {
        return res.status(400).json({
          success: false,
          message: "tdsTcsEntries must be an array",
        });
      }
      for (const [i, entry] of req.body.tdsTcsEntries.entries()) {
        if (entry.taxPercentage === undefined || entry.taxPercentage === null || isNaN(entry.taxPercentage)) {
          return res.status(400).json({
            success: false,
            message: `tdsTcsEntries[${i}].taxPercentage is required and must be a number`,
          });
        }
        if (!entry.type || typeof entry.type !== "string") {
          return res.status(400).json({
            success: false,
            message: `tdsTcsEntries[${i}].type is required and must be a string`,
          });
        }
        if (!entry.taxName || typeof entry.taxName !== "string") {
          return res.status(400).json({
            success: false,
            message: `tdsTcsEntries[${i}].taxName is required and must be a string`,
          });
        }
        if (!entry.applicableOn || typeof entry.applicableOn !== "string") {
          return res.status(400).json({
            success: false,
            message: `tdsTcsEntries[${i}].applicableOn is required and must be a string`,
          });
        }
      }
    }
    const data = await createInvoice(req.body, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data,
    });
  } catch (err: any) {
    await t.rollback();
    console.error("Create Invoice Error:", err);
    if (err.name === 'SequelizeUniqueConstraintError' && err.errors && err.errors[0]?.path?.includes('invoice_invoice_no_company_id')) {
      return res.status(400).json({
        success: false,
        message: "Invoice number must be unique for this company.",
        error: err.message,
      });
    }
    return serverError(res, err.message || "Failed to create invoice.");
  }
});

// GET /accounting/invoice/getInvoiceById/:id?companyId=
router.get("/getInvoiceById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];

    let { companyId } = req.query;
    companyId = companyId as string;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }
    const company = await Company.findByPk(companyId);
    if (!company) {
        return res.status(400).json({
        success: false,
        message: "company not found",
      });
    }

    const data = await getInvoiceById(
      id,
      companyId as string
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    return serverError(res, "Failed to fetch invoice.");
  }
});

// GET /accounting/invoice/getInvoiceByCompanyId?companyId=
router.get("/getInvoiceByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
      let { companyId } = req.query;
      companyId = companyId as string;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "companyId is required",
        });
      }
      const company = await Company.findByPk(companyId);
      if (!company) {
        return res.status(400).json({
          success: false,
          message: "company not found",
        });
      }

      const data = await getInvoicesByCompany(companyId as string);
      if (!data) {
      return res.status(404).json({
        success: false,
        message: `No invoices for company ${companyId}`,
      });
    }

      res.json({
        success: true,
        data,
        count: data.length,
      });
    } catch (err) {
      return serverError(res, "Failed to fetch invoices.");
    }
  }
);

// GET /accounting/invoice/getInvoiceByClientId/:clientId?companyId=
router.get("/getInvoiceByClientId/:clientId", async (req: Request, res: Response): Promise<any> => {
    try {
      let clientId = req.params.clientId;
      if (Array.isArray(clientId)) clientId = clientId[0];

      let { companyId } = req.query;
      companyId = companyId as string;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "companyId is required",
        });
      } 
      const company = await Company.findByPk(companyId);
      if (!company) {
        return res.status(400).json({
          success: false,
          message: "company not found",
        });
      }

      const data = await getInvoicesByClient(
        clientId,
        companyId as string
      );
      if (!data) {
      return res.status(404).json({
        success: false,
        message: `No invoices for client ${clientId}`,
      });
    }

      res.json({
        success: true,
        data,
        count: data.length,
      });
    } catch (err) {
      return serverError(res, "Failed to fetch invoices.");
    }
  }
);

// GET /accounting/invoice/searchInvoice/?companyId=...&clientName=...&invoiceNo=...&status=...&city=...&type=...&itemName=...&issueDateFrom=...&issueDateTo=...&dueDateFrom=...&dueDateTo=...
router.get("/searchInvoice", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.query;
    companyId = companyId as string;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }
    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: "company not found",
      });
    }

    // Build filters object from query params
    const filters: any = {
      companyId: companyId as string,
    };

    if (req.query.clientName) {
      filters.clientName = req.query.clientName as string;
    }

    if (req.query.invoiceNo) {
      filters.invoiceNo = req.query.invoiceNo as string;
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

    if (req.query.issueDateFrom) {
      filters.issueDateFrom = new Date(req.query.issueDateFrom as string);
    }

    if (req.query.issueDateTo) {
      filters.issueDateTo = new Date(req.query.issueDateTo as string);
    }

    if (req.query.dueDateFrom) {
      filters.dueDateFrom = new Date(req.query.dueDateFrom as string);
    }

    if (req.query.dueDateTo) {
      filters.dueDateTo = new Date(req.query.dueDateTo as string);
    }

    const data = await searchInvoices(filters);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Search Invoice Error:", err);
    return serverError(res, err.message || "Failed to search invoices.");
  }
});

// PATCH /accounting/invoice/updateInvoice/:id?companyId=
router.patch("/updateInvoice/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    let { companyId } = req.query;
    companyId = companyId as string;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }
    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: "company not found",
      });
    }
    try {
      if(req.body.items){
        for (const [i, item] of req.body.items.entries()) {
          if (!item.itemId || typeof item.itemId !== "string") {
            return res.status(400).json({
              success: false,
              message: `items[${i}].itemId is required and must be a string`,
            });
          }
          if (item.quantity === undefined || item.quantity === null || isNaN(item.quantity)) {
            return res.status(400).json({
              success: false,
              message: `items[${i}].quantity is required and must be a number`,
            });
          }
        }
      }
      if (req.body.tdsTcsEntries) {
        if (!Array.isArray(req.body.tdsTcsEntries)) {
          return res.status(400).json({
            success: false,
            message: "tdsTcsEntries must be an array",
          });
        }
        for (const [i, entry] of req.body.tdsTcsEntries.entries()) {
          if (entry.taxPercentage === undefined || entry.taxPercentage === null || isNaN(entry.taxPercentage)) {
            return res.status(400).json({
              success: false,
              message: `tdsTcsEntries[${i}].taxPercentage is required and must be a number`,
            });
          }
          if (!entry.type || typeof entry.type !== "string") {
            return res.status(400).json({
              success: false,
              message: `tdsTcsEntries[${i}].type is required and must be a string`,
            });
          }
          if (!entry.taxName || typeof entry.taxName !== "string") {
            return res.status(400).json({
              success: false,
              message: `tdsTcsEntries[${i}].taxName is required and must be a string`,
            });
          }
          if (!entry.applicableOn || typeof entry.applicableOn !== "string") {
            return res.status(400).json({
              success: false,
              message: `tdsTcsEntries[${i}].applicableOn is required and must be a string`,
            });
          }
        }
      }

      let id = req.params.id;
      if (Array.isArray(id)) id = id[0];
      const data = await updateInvoice(
        id,
        companyId as string,
        req.body,
        t
      );

      await t.commit();

      return res.json({
        success: true,
        message: "Invoice updated successfully",
        data,
      });
    } catch (err: any) {
      await t.rollback();
      console.error("Update Invoice Error:", err);
      return serverError(res, err.message || "Failed to update invoice");
    }
  }
);

// DELETE /accounting/invoice/delete/:id?companyId=
router.delete("/deleteInvoice/:id",async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      let id = req.params.id;
      if (Array.isArray(id)) id = id[0];
      let { companyId } = req.query;
      companyId = companyId as string;

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "companyId is required",
        });
      }
      const company = await Company.findByPk(companyId);
      if (!company) {
        return res.status(400).json({
          success: false,
          message: "company not found",
        });
      }
      const deleteResult = await deleteInvoice(
        id,
        companyId as string,
        t
      );

      if (!deleteResult) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      await t.commit();
      return res.json({
        success: true,
        message: "Invoice deleted successfully",
      });
    } catch (err) {
      await t.rollback();
      console.error("Delete Invoice Error:", err);
      return serverError(res, "Failed to delete invoice");
    }
  }
);

// POST /accounting/invoice/convertToPayment/:id?companyId
router.post("/convertToPayment/:id",async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let companyId = req.query.companyId;
    let invoiceId  = req.params.id;
    if (Array.isArray(invoiceId)) invoiceId = invoiceId[0];
    companyId = companyId as string;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }
    const company = await Company.findByPk(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: "company not found",
      });
    }
    const invoiceData = req.body;
    if (!companyId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "companyId is required" });
    }

    // Optionally validate invoiceData fields if needed
    if (invoiceData && invoiceData.items) {
      if (!Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "items must be a non-empty array" });
      }
      for (const [i, item] of invoiceData.items.entries()) {
        if (!item.itemId || typeof item.itemId !== "string") {
          await t.rollback();
          return res.status(400).json({ success: false, message: `items[${i}].itemId is required and must be a string` });
        }
        if (item.quantity === undefined || item.quantity === null || isNaN(item.quantity)) {
          await t.rollback();
          return res.status(400).json({ success: false, message: `items[${i}].quantity is required and must be a number` });
        }
      }
    }
    const result = await convertInvoiceToPayment(invoiceId, companyId, invoiceData, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Invoice converted to payment successfully",
      data: result,
    });
  } catch (err: any) {
    await t.rollback();
    return res.status(400).json({ success: false, message: err.message || "Failed to convert purchase order to bill" });
  }
});

/**
 * GET /accounting/invoice/getInvoicePendingAmount/:clientId?companyId=
 * Calculate the pending invoice amount of client in accounting
 */
router.get("/getInvoicePendingAmount/:clientId", async (req: Request, res: Response): Promise<any> => {
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
    const pendingAmount = await getPendingInvoiceAmount(clientId, companyId);
    
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

// GET /accounting/invoice/getInvoiceByPublicToken/:publicToken
router.get("/getInvoiceByPublicToken/:publicToken", async (req: Request, res: Response): Promise<any> => {
  try {
    let publicToken = req.params.publicToken;
    if (Array.isArray(publicToken)) publicToken = publicToken[0];
    const invoice = await getInvoiceByPublicToken(publicToken);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    return serverError(res, "Failed to fetch invoice by public token.");
  }
});

export default router;