import express, { Request, Response } from "express";
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  getPurchaseOrdersByCompany,
  updatePurchaseOrder,
  deletePurchaseOrder,
  convertPurchaseOrderToBill,
  searchPurchaseOrder,
} from "./purchase-order-handler";
import { serverError } from "../../../../utils/responseHandler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// POST /accounting/purchaseOrder/createPurchaseOrder
router.post("/createPurchaseOrder", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
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
    const data = await getPurchaseOrdersByCompany(req.query.companyId as string);
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
    const data = await getPurchaseOrderById(
      req.params.id,
      req.query.companyId as string
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
    const [affectedRows] = await updatePurchaseOrder(
      req.params.id,
      req.query.companyId as string,
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
    const [affectedRows] = await deletePurchaseOrder(
      req.params.id,
      req.query.companyId as string,
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
    const poId = req.params.id;
    const billData = req.body;
    if (!companyId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "companyId is required" });
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

export default router;
