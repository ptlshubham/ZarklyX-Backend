import express, { Request, Response } from "express";
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrdersByCompany,
  updatePurchaseOrder,
  deletePurchaseOrder,
  convertPurchaseOrderToBill,
  searchPurchaseOrder,
  getPurchaseOrderByPublicToken
} from "./purchase-order-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/purchaseOrder/createPurchaseOrder
router.post("/createPurchaseOrder", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const requiredFields = [
      "companyId", "vendorId", "placeOfSupply", "poNo", "poDate", "referenceNo", "validUntilDate",
    ];
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "") {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `${field} is required`,
        });
      }
    }
    const data = await createPurchaseOrder(req.body, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Purchase order created successfully",
      data,
    });
  } catch (err: any) {
    await t.rollback();
    return serverError(res, err.message || "Failed to create purchase order.");
  }
});

// GET /accounting/purchaseOrder/getPurchaseOrderByCompany?companyId=
router.get("/getPurchaseOrderByCompany", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }
    const data = await getPurchaseOrdersByCompany(companyId as string);
    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err) {
    console.log(err);
    return serverError(res, "Failed to fetch purchase orders.");
  }
});

// GET /accounting/purchaseOrder/getPurchaseOrderById/:id?companyId=
router.get("/getPurchaseOrderById/:id", async (req: Request, res: Response): Promise<any> => {
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
    const data = await getPurchaseOrderById(
      id,
      companyId as string
    );
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    return serverError(res, "Failed to fetch purchase order.");
  }
});

// GET /accounting/purchaseOrder/searchPurchaseOrder/?companyId=...&vendorName=...&poNo=...&status=...&city=...&type=...&itemName=...&issueDateFrom=...&issueDateTo=...&dueDateFrom=...&dueDateTo=...
router.get("/searchPurchaseOrder", async (req: Request, res: Response): Promise<any> => {
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

    if (req.query.poNo) {
      filters.poNo = req.query.poNo as string;
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

    const data = await searchPurchaseOrder(filters);

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error("Search Purchase Order Error:", err);
    return serverError(res, err.message || "Failed to search purchase order.");
  }
});

// PATCH /accounting/purchaseOrder/updateupdatePurchaseOrder/:id?companyId=
router.patch("/updatePurchaseOrder/:id", async (req: Request, res: Response): Promise<any> => {
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
    // At least one updatable field must be present
    const updatableFields = [
      "vendorId", "placeOfSupply", "poNo", "poDate", "referenceNo", "validUntilDate", "finalDiscount", "unitId", "totalQuantity", "shippingChargeType", "shippingAmount", "shippingTax", "addDiscountToAll", "showCess", "cessValue", "termsConditions", "privateNotes", "subTotal", "taxable", "cgst", "sgst", "igst", "total",
    ];
    const hasUpdate = updatableFields.some(field => req.body[field] !== undefined);
    if (!hasUpdate) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "At least one updatable field is required",
      });
    }
    const [affectedRows] = await updatePurchaseOrder(
      id,
      companyId as string,
      req.body,
      t
    );
    if (affectedRows === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }
    await t.commit();
    return res.json({
      success: true,
      message: "Purchase order updated successfully",
    });
  } catch (err) {
    await t.rollback();
    console.log(err);
    return serverError(res, "Failed to update purchase order");
  }
});

// DELETE /accounting/purchaseOrder/deletePurchaseOrder/:id?companyId=
router.delete("/deletePurchaseOrder/:id", async (req: Request, res: Response): Promise<any> => {
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
    const result = await deletePurchaseOrder(
      id,
      companyId as string,
      t
    );
    if (!result) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }
    await t.commit();
    return res.json({
      success: true,
      message: "Purchase order deleted successfully",
    });
  } catch (err: any) {
    await t.rollback();
    return serverError(res, err.message || "Failed to delete purchase order");
  }
});

// POST /accounting/purchaseOrder/convertToBill/:id?companyId=
router.post("/convertToBill/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId } = req.query;
    let poId = req.params.id;
    if (Array.isArray(poId)) poId = poId[0];
    const billData = req.body;
    if (!companyId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "companyId is required" });
    }
    // Validate required fields for billData (example: vendorId, billDate, total, etc.)
    const billRequiredFields = ["vendorId", "billDate", "total"];
    for (const field of billRequiredFields) {
      if (billData[field] === undefined || billData[field] === null || billData[field] === "") {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `${field} is required in bill data`,
        });
      }
    }
    const result = await convertPurchaseOrderToBill(poId, companyId as string, billData, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Purchase order converted to purchase bill successfully",
      data: result,
    });
  } catch (err: any) {
    await t.rollback();
    return res.status(400).json({ success: false, message: err.message || "Failed to convert purchase order to bill" });
  }
});

// GET /accounting/purchaseOrder/public/:publicToken
router.get("/public/:publicToken", async (req: Request, res: Response): Promise<any> => {
  try {
    let publicToken = req.params.publicToken;
    if (Array.isArray(publicToken)) publicToken = publicToken[0];
    const data = await getPurchaseOrderByPublicToken(publicToken);
    if (!data) {
      return res.status(404).json({ success: false, message: "Purchase order not found" });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return serverError(res, "Failed to fetch purchase order by public token.");
  }
});

export default router;
