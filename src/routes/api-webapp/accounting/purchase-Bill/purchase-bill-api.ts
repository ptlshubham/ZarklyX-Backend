import express, { Request, Response } from "express";
import {
  createPurchaseBill,
  getPurchaseBillById,
  getPurchaseBillsByCompany,
  getPurchaseBillsByVendor,
  updatePurchaseBill,
  deletePurchaseBill,
  convertPurchaseBillToPayment,
  searchPurchaseBill,
} from "./purchase-bill-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/purchase-bill/createPurchaseBill
router.post("/createPurchaseBill", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    // Validate required fields
    const {
      companyId,
      vendorId,
      placeOfSupply,
      invoiceNo,
      poNo,
      poDate,
      dueDate,
      items,
      showCess,
      reverseCharge,
    } = req.body;

    if (!companyId || !vendorId || !invoiceNo || !poNo || !poDate || !dueDate || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, vendorId, invoiceNo, poNo, poDate, dueDate, items",
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

    const data = await createPurchaseBill(req.body, t);
    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Purchase bill created successfully",
      data,
    });
  } catch (err: any) {
    await t.rollback();
    console.error("Create Purchase Bill Error:", err);
    return serverError(res, err.message || "Failed to create purchase bill.");
  }
});

// GET /accounting/purchase-bill/getPurchaseBillById/:id?companyId=
router.get("/getPurchaseBillById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const companyId = req.query.companyId as string;
    
    console.log(`[getPurchaseBillById] Fetching bill - id: ${id}, companyId: ${companyId}`);
    
    const data = await getPurchaseBillById(id, companyId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Purchase bill not found",
      });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("[getPurchaseBillById] Error:", err);
    return serverError(res, "Failed to fetch purchase bill.");
  }
});

// GET /accounting/purchase-bill/getPurchaseBillByCompanyId?companyId=
router.get("/getPurchaseBillByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
      const companyId = req.query.companyId as string;
      console.log(`[getPurchaseBillByCompanyId] Fetching bills for company: ${companyId}`);
      
      const data = await getPurchaseBillsByCompany(companyId);

      console.log(`[getPurchaseBillByCompanyId] Found ${data.length} bills`);
      if (data.length > 0) {
        console.log(`[getPurchaseBillByCompanyId] First bill vendor:`, (data[0] as any).vendor);
      }

      res.json({
        success: true,
        data,
        count: data.length,
      });
    } catch (err) {
      console.error("[getPurchaseBillByCompanyId] Error:", err);
      return serverError(res, "Failed to fetch purchase bills.");
    }
  }
);

// GET /accounting/purchase-bill/getPurchaseBillByVendorId/:vendorId?companyId=
router.get("/getPurchaseBillByVendorId/:vendorId", async (req: Request, res: Response): Promise<any> => {
    try {
      let vendorId = req.params.vendorId;
      if (Array.isArray(vendorId)) vendorId = vendorId[0];
      const data = await getPurchaseBillsByVendor(
        vendorId,
        req.query.companyId as string
      );

      res.json({
        success: true,
        data,
        count: data.length,
      });
    } catch (err) {
      return serverError(res, "Failed to fetch purchase bills.");
    }
  }
);

// GET /accounting/purchase-bill/searchPurchaseBill/?companyId=...&vendorName=...&purchaseBillNo=...&status=...&city=...&type=...&itemName=...&issueDateFrom=...&issueDateTo=...&dueDateFrom=...&dueDateTo=...
router.get("/searchPurchaseBill", async (req: Request, res: Response): Promise<any> => {
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

    if (req.query.vendorName) {
      filters.vendorName = req.query.vendorName as string;
    }

    if (req.query.purchaseBillNo) {
      filters.purchaseBillNo = req.query.purchaseBillNo as string;
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

    const data = await searchPurchaseBill(filters);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Search Purchase Bill Error:", err);
    return serverError(res, err.message || "Failed to search purchase bill.");
  }
});

// PATCH /accounting/purchase-bill/updatePurchaseBill/:id?companyId=
router.patch("/updatePurchaseBill/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      // Validate required fields if items are being updated
      if (req.body.items) {
        const { companyId, vendorId, items } = req.body;

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
      const data = await updatePurchaseBill(
        id,
        req.query.companyId as string,
        req.body,
        t
      );
      
      await t.commit();

      return res.json({
        success: true,
        message: "Purchase bill updated successfully",
        data,
      });
    } catch (err: any) {
      await t.rollback();
      console.error("Update Purchase Bill Error:", err);
      return serverError(res, err.message || "Failed to update purchase bill.");
    }
  }
);

// DELETE /accounting/purchase-bill/deletePurchaseBill/:id?companyId=
router.delete("/deletePurchaseBill/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      let id = req.params.id;
      if (Array.isArray(id)) id = id[0];
      await deletePurchaseBill(
        id,
        req.query.companyId as string,
        t
      );
      
      await t.commit();

      return res.json({
        success: true,
        message: "Purchase bill deleted successfully",
      });
    } catch (err: any) {
      await t.rollback();
      return serverError(res, err.message || "Failed to delete purchase bill.");
    }
  }
);

// POST /accounting/purchase-bill/convertToPayment/:id?companyId
router.post("/convertToPayment/:id",async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const companyId = req.query.companyId;
    let purchaseBillId = req.params.id;
    if (Array.isArray(purchaseBillId)) purchaseBillId = purchaseBillId[0];
    const purchaseBillData = req.body;
    if(!companyId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "companyId is required" });
    }
    const result = await convertPurchaseBillToPayment(companyId as string, purchaseBillId, purchaseBillData, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Purchase Bill converted to payment successfully",
      data: result,
    });
  } catch (err: any) {
    await t.rollback();
    return res.status(400).json({ success: false, message: err.message || "Failed to convert purchase order to bill" });
  }
})


export default router;