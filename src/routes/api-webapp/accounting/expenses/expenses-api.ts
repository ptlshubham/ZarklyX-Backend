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

const router = express.Router();

// Create a new expense
router.post(
  "/create",(async (req: Request, res: Response) => {
    const companyId = req.body.user.companyId;
    const expense = await createExpense(req.body, companyId);

    res.status(201).json({
      success: true,
      message: "Expense created successfully",
      data: expense,
    });
  })
);

// Get expense by ID
router.get(
  "/:id",
  async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const companyId = req.body.user.companyId;

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

// Get all expenses for company
router.get(
  "/",(async (req: Request, res: Response) => {
    const companyId = req.body.user.companyId;
    const expenses = await getExpensesByCompany(companyId);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Get expenses by vendor
router.get(
  "/vendor/:vendorId",(async (req: Request, res: Response) => {
    const { vendorId } = req.params;
    const companyId = req.body.user.companyId;

    const expenses = await getExpensesByVendor(vendorId, companyId);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Get expenses by client
router.get(
  "/client/:clientId",(async (req: Request, res: Response) => {
    const { clientId } = req.params;
    const companyId = req.body.user.companyId;

    const expenses = await getExpensesByClient(clientId, companyId);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Get expenses by payment method
router.get(
  "/payment-method/:paymentMethod",(async (req: Request, res: Response) => {
    const { paymentMethod } = req.params;
    const companyId = req.body.user.companyId;

    const expenses = await getExpensesByPaymentMethod(companyId, paymentMethod);

    res.status(200).json({
      success: true,
      message: "Expenses retrieved successfully",
      data: expenses,
    });
  })
);

// Update expense
router.put(
  "/:id",(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = req.body.user.companyId;

    const expense = await updateExpense(id, companyId, req.body);

    res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: expense,
    });
  })
);

// Delete expense (soft delete)
router.delete(
  "/:id",(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = req.body.user.companyId;

    await deleteExpense(id, companyId);

    res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
    });
  })
);

// Search expenses with filters
router.post(
  "/search",(async (req: Request, res: Response) => {
    const companyId = req.body.user.companyId;
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
  })
);

// Get expense summary
router.post(
  "/summary",(async (req: Request, res: Response) => {
    const companyId = req.body.user.companyId;
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
