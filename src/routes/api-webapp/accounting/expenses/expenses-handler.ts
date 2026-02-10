import { Op, Sequelize, Transaction } from "sequelize";
import { Expenses, PaymentMethod } from "./expenses-model";
import { ExpenseLineItem } from "./expense-line-item-model";
import { ExpenseItem } from "./expenses-item/expense-item-model";
import { Company } from "../../company/company-model";
import { Vendor } from "../vendor/vendor-model";
import { Clients } from "../../agency/clients/clients-model";

// Helper function to calculate line item totals (no discounts for expenses)
const calculateLineItemTotal = (
  quantity: number,
  unitPrice: number,
  tax: number = 0
): { taxAmount: number; totalAmount: number } => {
  // Calculate base amount
  const baseAmount = quantity * unitPrice;
  
  // Calculate tax on base amount
  const taxAmount = baseAmount * (tax / 100);
  
  // Calculate total
  const totalAmount = baseAmount + taxAmount;
  
  return {
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2))
  };
};

const applyTaxSplit = (
  amount: number,
  taxPercent: number,
  isInterState: boolean,
  totals: { cgst: number; sgst: number; igst: number }
): { cgst: number; sgst: number; igst: number } => {
  if (!taxPercent || amount <= 0) return totals;

  if (isInterState) {
    return { ...totals, igst: totals.igst + amount * (taxPercent / 100) };
  } else {
    const half = amount * (taxPercent / 200);
    return { ...totals, cgst: totals.cgst + half, sgst: totals.sgst + half };
  }
};

interface ExpenseCalculationResult {
  subTotal: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  total: number;
  expenseLineItemsData: any[];
}

interface CreateExpenseInput {
  companyId: string;
  vendorId?: string;
  clientId?: string;
  placeOfSupply: string;
  expenseNo: string;
  expenseDate: Date;
  paymentMethod: PaymentMethod;
  reverseCharge?: boolean;
  expenseItems: Array<{
    expenseItemId: string;
    expenseName?: string;
    unitId: string;
    quantity: number;
    unitPrice: number;
    tax?: number;
  }>;
  termsConditions?: string;
  privateNotes?: string;
}

// Shared calculation logic for expense totals
const calculateExpenseTotals = (
  items: any[],
  itemMap: Map<string, any>,
  placeOfSupply: string,
  companyState: string,
  reverseCharge: boolean
): ExpenseCalculationResult => {
  let subTotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const expenseLineItemsData = items.map((inputItem) => {
    const itemFromDb = itemMap.get(inputItem.expenseItemId);
    if (!itemFromDb) throw new Error(`Expense item ${inputItem.expenseItemId} not found`);

    const quantity = inputItem.quantity ?? 1;
    const unitPrice = inputItem.unitPrice;
    const itemTax = reverseCharge ? 0 : (inputItem.tax || 0);

    if (quantity <= 0 || unitPrice < 0 || isNaN(quantity) || isNaN(unitPrice)) {
      throw new Error(`Invalid quantity or price for expense item ${itemFromDb.expenseName}`);
    }

    const { taxAmount, totalAmount } = calculateLineItemTotal(
      quantity,
      unitPrice,
      itemTax
    );

    const baseAmount = quantity * unitPrice;
    subTotal += baseAmount;

    const taxableAmount = parseFloat(baseAmount.toFixed(2));

    // Apply tax split only if not reverse charge
    if (!reverseCharge && itemTax > 0) {
      const isInterState = placeOfSupply.toLowerCase() !== companyState.toLowerCase();
      const taxTotals = applyTaxSplit(baseAmount, itemTax, isInterState, {
        cgst: totalCgst,
        sgst: totalSgst,
        igst: totalIgst,
      });
      totalCgst = taxTotals.cgst;
      totalSgst = taxTotals.sgst;
      totalIgst = taxTotals.igst;
    }

    return {
      expenseItemId: itemFromDb.id,
      expenseName: inputItem.expenseName || itemFromDb.expenseName,
      unitId: inputItem.unitId,
      quantity,
      unitPrice,
      tax: itemTax,
      taxable: taxableAmount,
      taxAmount,
      totalAmount,
    };
  });

  const total = subTotal + totalCgst + totalSgst + totalIgst;
  const totalTaxable = subTotal;

  return {
    subTotal,
    taxable: parseFloat(totalTaxable.toFixed(2)),
    totalCgst,
    totalSgst,
    totalIgst,
    total,
    expenseLineItemsData,
  };
};

// Create expense with all related data
export const createExpense = async (body: CreateExpenseInput, t: Transaction) => {
  const expenseDate = body.expenseDate || new Date();

  // Validate required fields
  if (!body.companyId) {
    throw new Error("Company ID is required");
  }

  if (!body.expenseItems || !Array.isArray(body.expenseItems) || body.expenseItems.length === 0) {
    throw new Error("At least one expense item is required");
  }

  // Validate that at least one of vendorId or clientId is provided
  if (!body.vendorId && !body.clientId) {
    throw new Error("Either vendorId or clientId must be provided");
  }

  // Fetch all expense items from database to get their details
  const itemIds = body.expenseItems.map(item => item.expenseItemId);
  
  if (!itemIds || itemIds.length === 0) {
    throw new Error("No valid expense item IDs provided");
  }
  
  const itemsFromDb = await ExpenseItem.findAll({
    where: { id: { [Op.in]: itemIds }, companyId: body.companyId, isActive: true, isDeleted: false }
  });
  const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

  if (itemsFromDb.length !== itemIds.length) {
    throw new Error("One or more expense items not found or inactive");
  }

  // Fetch company details to get state for tax calculation
  const company = await Company.findByPk(body.companyId);
  if (!company) {
    throw new Error("Company not found");
  }
  const companyState = company.state ?? "";

  const calculated = calculateExpenseTotals(
    body.expenseItems,
    itemMap,
    body.placeOfSupply,
    companyState,
    body.reverseCharge || false
  );

  // Create expense
  const expense = await Expenses.create(
    {
      companyId: body.companyId,
      vendorId: body.vendorId || null,
      clientId: body.clientId || null,
      placeOfSupply: body.placeOfSupply,
      expenseNo: body.expenseNo,
      expenseDate,
      paymentMethod: body.paymentMethod as PaymentMethod,
      reverseCharge: body.reverseCharge || false,
      termsConditions: body.termsConditions || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      taxable: calculated.taxable,
      cgst: parseFloat(calculated.totalCgst.toFixed(2)),
      sgst: parseFloat(calculated.totalSgst.toFixed(2)),
      igst: parseFloat(calculated.totalIgst.toFixed(2)),
      total: parseFloat(calculated.total.toFixed(2)),
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create expense line items
  const createdExpenseLineItems = await ExpenseLineItem.bulkCreate(
    calculated.expenseLineItemsData.map(item => ({
      ...item,
      expenseId: expense.id,
      companyId: body.companyId,
    })),
    { transaction: t }
  );

  return {
    expense,
    expenseLineItems: createdExpenseLineItems,
  };
};

// Get expense by ID with all related data
export const getExpenseById = async (id: string, companyId: string) => {
  return await Expenses.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: ExpenseLineItem,
        as: "expenseLineItems",
      },
      {
        model: Vendor,
        as: "vendor",
        required: false,
      },
      {
        model: Clients,
        as: "client",
        required: false,
      },
    ],
  });
};

// Get all expenses for a company
export const getExpensesByCompany = async (companyId: string) => {
  return await Expenses.findAll({
    where: { companyId, isDeleted: false },
    include: [
      {
        model: Vendor,
        as: "vendor",
        required: false,
      },
      {
        model: Clients,
        as: "client",
        required: false,
      },
    ],
    order: [["expenseDate", "DESC"]],
  });
};

// Get expenses by vendor
export const getExpensesByVendor = async (vendorId: string, companyId: string) => {
  return await Expenses.findAll({
    where: { vendorId, companyId, isDeleted: false },
    include: [
      {
        model: ExpenseLineItem,
        as: "expenseLineItems",
      },
    ],
    order: [["expenseDate", "DESC"]],
  });
};

// Get expenses by client
export const getExpensesByClient = async (clientId: string, companyId: string) => {
  return await Expenses.findAll({
    where: { clientId, companyId, isDeleted: false },
    include: [
      {
        model: ExpenseLineItem,
        as: "expenseLineItems",
      },
    ],
    order: [["expenseDate", "DESC"]],
  });
};

// Update expense
export const updateExpense = async (id: string, companyId: string, data: Partial<CreateExpenseInput>) => {
  const expense = await getExpenseById(id, companyId);
  if (!expense) {
    throw new Error("Expense not found");
  }

  // Validate vendor or client if provided
  if (data.vendorId) {
    const vendor = await Vendor.findOne({
      where: { id: data.vendorId, companyId, isDeleted: false },
    });
    if (!vendor) {
      throw new Error("Vendor not found");
    }
  }

  if (data.clientId) {
    const client = await Clients.findOne({
      where: { id: data.clientId, companyId, isDeleted: false },
    });
    if (!client) {
      throw new Error("Client not found");
    }
  }

  // Calculate totals if line items are provided
  let calculatedData = { ...data };
  if (data.expenseItems) {
    // Fetch all expense items from database to get their details
    const itemIds = data.expenseItems.map(item => item.expenseItemId);
    const itemsFromDb = await ExpenseItem.findAll({
      where: { id: { [Op.in]: itemIds }, companyId, isActive: true, isDeleted: false }
    });
    const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

    // Fetch company details to get state for tax calculation
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new Error("Company not found");
    }
    const companyState = company.state ?? "";

    const totals = calculateExpenseTotals(
      data.expenseItems,
      itemMap,
      expense.placeOfSupply,
      companyState,
      data.reverseCharge ?? expense.reverseCharge
    );
    calculatedData = { ...data, ...totals };

    // Delete existing line items
    await ExpenseLineItem.destroy({
      where: { expenseId: id },
    });

    // Create new line items
    const lineItems = await Promise.all(
      data.expenseItems.map(async (item) => {
        const expenseItem = await ExpenseItem.findOne({
          where: { id: item.expenseItemId, companyId },
        });
        if (!expenseItem) {
          throw new Error(`Expense item ${item.expenseItemId} not found`);
        }

        const lineItemTotal = calculateLineItemTotal(
          item.quantity,
          item.unitPrice,
          item.tax || 0
        );

        return {
          ...item,
          expenseName: item.expenseName ?? expenseItem.expenseName,
          expenseId: id,
          companyId: companyId,
          totalAmount: lineItemTotal.totalAmount,
          isActive: true,
          isDeleted: false,
        };
      })
    );

    await ExpenseLineItem.bulkCreate(lineItems);
  }

  // Ensure paymentMethod is of type PaymentMethod if present
  if (calculatedData.paymentMethod) {
    calculatedData.paymentMethod = calculatedData.paymentMethod as PaymentMethod;
  }

  await expense.update(calculatedData);

  // Return updated expense
  return await getExpenseById(id, companyId);
};

// Soft delete expense
export const deleteExpense = async (id: string, companyId: string) => {
  return await Expenses.update(
    { isActive: false, isDeleted: true },
    { where: { id, companyId, isDeleted: false } }
  );
};

// Search expenses with filters
export interface SearchExpenseFilters {
  companyId: string;
  vendorName?: string;
  clientName?: string;
  expenseName?: string;
  paymentMethod?: string;
  amountFrom?: number;
  amountTo?: number;
  expenseDateFrom?: Date;
  expenseDateTo?: Date;
}

export const searchExpenses = async (filters: SearchExpenseFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by payment method
  if (filters.paymentMethod) {
    whereConditions.paymentMethod = filters.paymentMethod;
  }

  // Filter by expense date range
  if (filters.expenseDateFrom || filters.expenseDateTo) {
    const dateFilter: any = {};
    if (filters.expenseDateFrom) dateFilter[Op.gte] = filters.expenseDateFrom;
    if (filters.expenseDateTo) dateFilter[Op.lte] = filters.expenseDateTo;
    whereConditions.expenseDate = dateFilter;
  }

  // Filter by amount range
  if (filters.amountFrom || filters.amountTo) {
    const amountFilter: any = {};
    if (filters.amountFrom) amountFilter[Op.gte] = filters.amountFrom;
    if (filters.amountTo) amountFilter[Op.lte] = filters.amountTo;
    whereConditions.total = amountFilter;
  }

  // Build include array for associations
  const includeArray: any[] = [
    {
      model: ExpenseLineItem,
      as: "expenseLineItems",
    },
  ];

  // Filter by vendor name
  if (filters.vendorName) {
    const vendorWhere: any = {
      [Op.or]: [
        { firstName: { [Op.like]: `%${filters.vendorName}%` } },
        { lastName: { [Op.like]: `%${filters.vendorName}%` } },
        { businessName: { [Op.like]: `%${filters.vendorName}%` } },
      ],
    };

    includeArray.push({
      model: Vendor,
      as: "vendor",
      where: vendorWhere,
      required: true,
    });
  } else {
    includeArray.push({
      model: Vendor,
      as: "vendor",
      required: false,
    });
  }

  // Filter by client name
  if (filters.clientName) {
    const clientWhere: any = {
      [Op.or]: [
        { clientfirstName: { [Op.like]: `%${filters.clientName}%` } },
        { clientLastName: { [Op.like]: `%${filters.clientName}%` } },
        { businessName: { [Op.like]: `%${filters.clientName}%` } },
      ],
    };

    includeArray.push({
      model: Clients,
      as: "client",
      where: clientWhere,
      required: true,
    });
  } else {
    includeArray.push({
      model: Clients,
      as: "client",
      required: false,
    });
  }

  // Filter by expense name
  if (filters.expenseName) {
    includeArray[0] = {
      model: ExpenseLineItem,
      as: "expenseLineItems",
      include: [
        {
          model: ExpenseItem,
          as: "expenseItem",
          where: {
            expenseName: {
              [Op.like]: `%${filters.expenseName}%`,
            },
          },
          required: true,
        },
      ],
      required: true,
    };
  }

  return await Expenses.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["expenseDate", "DESC"]],
    subQuery: false,
  });
};

// Get expense summary by date range
export const getExpenseSummary = async (
  companyId: string,
  startDate?: Date,
  endDate?: Date
) => {
  const whereConditions: any = {
    companyId,
    isDeleted: false,
  };

  if (startDate || endDate) {
    const dateFilter: any = {};
    if (startDate) dateFilter[Op.gte] = startDate;
    if (endDate) dateFilter[Op.lte] = endDate;
    whereConditions.expenseDate = dateFilter;
  }

  const expenses = await Expenses.findAll({
    where: whereConditions,
    attributes: [
      [Sequelize.fn("SUM", Sequelize.col("total")), "totalExpenses"],
      [Sequelize.fn("SUM", Sequelize.col("taxable")), "totalTaxable"],
      [Sequelize.fn("SUM", Sequelize.col("cgst")), "totalCgst"],
      [Sequelize.fn("SUM", Sequelize.col("sgst")), "totalSgst"],
      [Sequelize.fn("SUM", Sequelize.col("igst")), "totalIgst"],
      [Sequelize.fn("COUNT", Sequelize.col("id")), "expenseCount"],
    ],
    raw: true,
  });

  return expenses[0];
};

// Get expenses by payment method
export const getExpensesByPaymentMethod = async (
  companyId: string,
  paymentMethod: string
) => {
  return await Expenses.findAll({
    where: { companyId, paymentMethod, isDeleted: false },
    include: [
      {
        model: ExpenseLineItem,
        as: "expenseLineItems",
      },
      {
        model: Vendor,
        as: "vendor",
        required: false,
      },
      {
        model: Clients,
        as: "client",
        required: false,
      },
    ],
    order: [["expenseDate", "DESC"]],
  });
};