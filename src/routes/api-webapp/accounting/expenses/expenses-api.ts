import express, { Request, Response } from "express";
import {
  createExpense,
  getExpenseById,
  getExpensesByCompany,
  getExpensesByVendor,
  getExpensesByClient,
  updateExpense,
  deleteExpense,
  searchExpenses,
  getExpenseSummary,
  getExpensesByPaymentMethod,
  SearchExpenseFilters,
} from "./expenses-handler";
import dbInstance from "../../../../db/core/control-db";

const router = express.Router();

// Create a new expense
router.post("/createExpense", async (req: Request, res: Response) => {
  const t = await dbInstance.transaction();
  try {
    // Get companyId from the request body (frontend sends it directly)
    const expenseData = {
      ...req.body,
      companyId: req.body.companyId
    };

    console.log("Creating expense with data:", expenseData);
    
    if (!expenseData.companyId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Company ID is required"
      });
    }
    
    const expense = await createExpense(expenseData, t);

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Expense created successfully",
      data: expense,
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Error creating expense:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create expense",
    });
  }
});

// Get expense by ID
router.get("/getExpenseById/:id", async (req: Request, res: Response): Promise<any> => {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const companyId = (req as any).user?.companyId || (req.query.companyId as string) || req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const expense = await getExpenseById(id, companyId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Expense retrieved successfully",
      data: expense,
    });
  }
);

// Get all expenses for company (from auth token)
router.get("/getAllExpensesByCompanyId", async (req: Request, res: Response) => {
    const companyId = (req as any).user?.companyId || (req.query.companyId as string) || req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }
    const expenses = await getExpensesByCompany(companyId);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  }
);

// Get expenses by company ID (from query parameter)
router.get("/getExpensesByCompanyId", async (req: Request, res: Response): Promise<any> => {
    try {
      const companyId = req.query.companyId as string;
      
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "Company ID is required",
        });
      }
      
      const expenses = await getExpensesByCompany(companyId);
      
      res.json({ success: true, data: expenses });
    } catch (err) {
      console.error('Error fetching expenses:', err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch expenses",
      });
    }
  }
);

// Get expenses by vendor
router.get("/getExpensesByVendorId/:vendorId",(async (req: Request, res: Response) => {
    let vendorId = req.params.vendorId;
    if (Array.isArray(vendorId)) vendorId = vendorId[0];
    const companyId = (req as any).user?.companyId || (req.query.companyId as string) || req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const expenses = await getExpensesByVendor(vendorId, companyId);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Get expenses by client
router.get("/getExpensesByClientId/:clientId",(async (req: Request, res: Response) => {
    let clientId = req.params.clientId;
    if (Array.isArray(clientId)) clientId = clientId[0];
    const companyId = (req as any).user?.companyId || (req.query.companyId as string) || req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const expenses = await getExpensesByClient(clientId, companyId);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Get expenses by payment method
router.get("/getExpensesByPaymentMethod/:paymentMethod",(async (req: Request, res: Response) => {
    let paymentMethod = req.params.paymentMethod;
    if (Array.isArray(paymentMethod)) paymentMethod = paymentMethod[0];
    const companyId = (req as any).user?.companyId || (req.query.companyId as string) || req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const expenses = await getExpensesByPaymentMethod(companyId, paymentMethod);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Update expense
router.put("/updateExpenses/:id",(async (req: Request, res: Response) => {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const companyId = (req as any).user?.companyId || (req.body && (req.body.companyId || req.body.user?.companyId)) || (req.query.companyId as string);
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    const expense = await updateExpense(id, companyId, req.body);

    res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: expense,
    });
  })
);

// Delete expense (soft delete)
router.delete("/deleteExpenses/:id",(async (req: Request, res: Response) => {
    let id = req.params.id;
    if (Array.isArray(id)) id = id[0];
    const companyId = (req as any).user?.companyId || (req.query.companyId as string) || req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    await deleteExpense(id, companyId);

    res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
    });
  })
);

// Search expenses with filters
router.post("/searchExpenses",async (req: Request, res: Response) => {
    const companyId = (req as any).user?.companyId || req.body?.companyId || (req.query.companyId as string);
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }
    const filters: SearchExpenseFilters = {
      companyId,
      ...req.body,
    };

    const expenses = await searchExpenses(filters);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  }
);

// Get expense summary
router.post("/getExpensesSummary",(async (req: Request, res: Response) => {
    const companyId = (req as any).user?.companyId || req.body?.companyId || (req.query.companyId as string);
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }
    const { startDate, endDate } = req.body;

    const summary = await getExpenseSummary(
      companyId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.status(200).json({
      success: true,
      message: "Expense summary retrieved successfully",
      data: summary,
    });
  })
);

export default router;
