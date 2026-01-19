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
} from "./invoice-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/invoice/create
router.post("/createInvoice", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    // Validate required fields
    const {
      companyId,
      invoiceType,
      clientId,
      taxSelectionOn,
      placeOfSupply,
      invoiceNo,
      paymentTerms,
      items,
      showCess,
      reverseCharge,
    } = req.body;

    if (!companyId || !invoiceType || !clientId || !invoiceNo || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, invoiceType, clientId, invoiceNo, items",
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

    // If payment terms is "specific date", require specificDueDate
    if (paymentTerms === "specific date" && !req.body.specificDueDate) {
      return res.status(400).json({
        success: false,
        message: 'specificDueDate is required when paymentTerms is "specific date"',
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
    return serverError(res, err.message || "Failed to create invoice.");
  }
});

// GET /accounting/invoice/getInvoiceById/:id?companyId=
router.get("/getInvoiceById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const data = await getInvoiceById(
      req.params.id,
      req.query.companyId as string
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

// GET /accounting/invoice/get-by-company?companyId=
router.get("/getInvoiceByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
      const data = await getInvoicesByCompany(req.query.companyId as string);

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
      const data = await getInvoicesByClient(
        req.params.clientId,
        req.query.companyId as string
      );

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

// PATCH /accounting/invoice/update/:id?companyId=
router.patch("/updateInvoice/:id", async (req: Request, res: Response): Promise<any> => {
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

      const data = await updateInvoice(
        req.params.id,
        req.query.companyId as string,
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
      const [affectedRows] = await deleteInvoice(
        req.params.id,
        req.query.companyId as string,
        t
      );

      if (affectedRows === 0) {
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
    console.log("company id:  ",req.query)
    console.log("company id:  ",req.query)
    const { companyId } = req.query;
    const { invoiceId } = req.params;
    const invoiceData = req.body;
    if(!companyId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "companyId is required" });
    }
    const result = await convertInvoiceToPayment(companyId as string, invoiceId, invoiceData, t);
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
})

export default router;