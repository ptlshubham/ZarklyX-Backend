import { Op, Transaction } from "sequelize";
import { Quote } from "./quote-model";
import { QuoteItem } from "./quote-item-model";
import { Item } from "../item/item-model";
import { QuoteTdsTcs } from "./tds-tcs/quote-tds-tcs-model";
import { Company } from "../../company/company-model";
import { TaxSelection } from "./quote-model";
import { calculateDueDate, InvoiceType } from "../invoice/invoice-handler";
import { Invoice, PaymentTerms } from "../invoice/invoice-model";
import { InvoiceItem } from "../invoice/invoice-item-model";
import { InvoiceTdsTcs } from "../invoice/tds-tcs/invoice-tds-tcs-model";
import { Clients } from "../../agency/clients/clients-model";

// Helper function to calculate line item totals
const calculateLineItemTotal = (
  quantity: number,
  unitPrice: number,
  discountPercentage: number = 0,
  tax: number = 0,
  cessPercentage: number = 0
): { discountAmount: number; taxAmount: number; totalAmount: number } => {
  // Calculate base amount
  const baseAmount = quantity * unitPrice;
  
  // Apply discount percentage
  const discountAmount = baseAmount * (discountPercentage / 100);
  const amountAfterDiscount = baseAmount - discountAmount;
  
  // Calculate tax on discounted amount
  const taxAmount = (amountAfterDiscount * (tax / 100)) + (amountAfterDiscount * (cessPercentage / 100));
  
  // Calculate total
  const totalAmount = amountAfterDiscount + taxAmount;
  
  return {
    discountAmount: parseFloat(discountAmount.toFixed(2)),
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

interface QuoteCalculationResult {
  subTotal: number;
  finalDiscount: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  total: number;
  quoteItemsData: any[];
}

interface CreateQuoteInput {
  companyId: string;
  clientId: string;
  taxSelectionOn: TaxSelection;
  placeOfSupply: string;
  quotationNo: string;
  quotationDate?: Date;
  poNo: string;
  validUntilDate: Date;
  items: Array<{
    itemId: string;
    itemName?: string;
    description?: string | null;
    hsn?: string | null;
    sac?: string | null;
    unitId?: string | null;
    unitPrice?: number;
    quantity?: number;
    discount?: number; // Item-specific discount percentage
  }>;
  unitId?: string;
  shippingChargeType?: string;
  shippingAmount?: number;
  shippingTax?: number;
  addDiscountTotal?: number; // Discount on subtotal (fixed amount)
  addDiscountToAll?: number; // Discount distributed to all items (percentage)
  customAmountLabel?: string;
  customAmount?: number;
  showCess: boolean;
  tdsTcsEntries?: Array<{
    taxPercentage: number;
    type: string;
    taxName: string;
    applicableOn: string; // "taxable" or "total"
  }>;
  termsConditions?: string;
  privateNotes?: string;
}

// Shared calculation logic for quote totals
const calculateQuoteTotals = (
  items: any[],
  itemMap: Map<string, any>,
  addDiscountToAll: number | undefined,
  showCess: boolean,
  placeOfSupply: string,
  companyState: string,
  shippingAmount: number | undefined,
  shippingTax: number | undefined,
  customAmount: number | undefined,
  addDiscountTotal: number | undefined,
  tdsTcsEntries: any[] | undefined
): QuoteCalculationResult => {
  let subTotal = 0;
  let finalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const quoteItemsData = items.map((inputItem) => {
    const itemFromDb = itemMap.get(inputItem.itemId);
    if (!itemFromDb) throw new Error(`Item ${inputItem.itemId} not found`);

    const effectiveDiscountPercentage = addDiscountToAll !== undefined && addDiscountToAll !== null
      ? addDiscountToAll
      : (inputItem.discount || 0);

    const itemTax = itemFromDb.tax || 0;
    const cessTax = showCess ? (itemFromDb.cessPercentage || 0) : 0;

    const quantity = inputItem.quantity ?? 1;
    const unitPrice = inputItem.unitPrice ?? itemFromDb.unitPrice;

    if (quantity <= 0 || unitPrice < 0 || isNaN(quantity) || isNaN(unitPrice)) {
      throw new Error(`Invalid quantity or price for item ${itemFromDb.itemName}`);
    }

    const { discountAmount, taxAmount, totalAmount } = calculateLineItemTotal(
      quantity,
      unitPrice,
      effectiveDiscountPercentage,
      itemTax,
      cessTax
    );

    const baseAmount = quantity * unitPrice;
    subTotal += baseAmount;
    finalDiscount += discountAmount;

    const amountForTax = baseAmount - discountAmount;
    const taxableAmount = parseFloat(amountForTax.toFixed(2));

    const taxTotals = applyTaxSplit(amountForTax, itemTax, placeOfSupply !== companyState, {
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
    });
    totalCgst = taxTotals.cgst;
    totalSgst = taxTotals.sgst;
    totalIgst = taxTotals.igst;

    if (showCess && cessTax > 0) {
      const cessAmount = amountForTax * (cessTax / 100);
      totalCess += cessAmount;
    }

    return {
      itemId: itemFromDb.id,
      itemName: itemFromDb.itemName,
      description: itemFromDb.description,
      hsn: itemFromDb.hsn,
      sac: itemFromDb.sac,
      unitId: itemFromDb.unitId!,
      tax: itemFromDb.tax || 0,
      cessPercentage: itemFromDb.cessPercentage || 0,
      quantity,
      unitPrice,
      discount: effectiveDiscountPercentage,
      taxable: taxableAmount,
      taxAmount,
      totalAmount,
    };
  });

  // Add shipping charges
  if (shippingAmount && shippingAmount > 0) {
    if (shippingTax) {
      const shippingTaxAmount = shippingAmount * (shippingTax / 100);
      if (placeOfSupply !== companyState) {
        totalIgst += shippingTaxAmount;
      } else {
        totalCgst += shippingTaxAmount / 2;
        totalSgst += shippingTaxAmount / 2;
      }
    }
  }

  const customAmountValue = customAmount || 0;
  const discountOnTotal = addDiscountTotal || 0;
  const totalBeforeTdsTcs = subTotal + totalCgst + totalSgst + totalIgst + totalCess - finalDiscount + (shippingAmount || 0) + customAmountValue - discountOnTotal;

  // Calculate TDS and TCS amounts
  let totalTds = 0;
  let totalTcs = 0;
  const taxableBase = subTotal - finalDiscount + (shippingAmount || 0) + (customAmount || 0) - (addDiscountTotal || 0);
  const totalBase = taxableBase + totalCgst + totalSgst + totalIgst + totalCess;

  if (tdsTcsEntries && tdsTcsEntries.length > 0) {
    tdsTcsEntries.forEach(entry => {

      const baseAmount =
      entry.applicableOn === "total" ? totalBase : taxableBase;

      const taxAmount = baseAmount * (entry.taxPercentage / 100); 
      // const taxAmount = taxableBase * (entry.taxPercentage / 100);

      if (entry.type.toLowerCase() === "tds") {
        totalTds += taxAmount;
      } else if (entry.type.toLowerCase() === "tcs") {
        totalTcs += taxAmount;
      }
    });
  }

  const total = totalBeforeTdsTcs + totalTcs - totalTds;
  const totalTaxable = subTotal - finalDiscount;

  return {
    subTotal,
    finalDiscount,
    taxable: parseFloat(totalTaxable.toFixed(2)),
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    total,
    quoteItemsData,
  };
};

// Create quote with all related data
export const createQuote = async (body: CreateQuoteInput, t: Transaction) => {
  // Calculate valid until date
  const quotationDate = body.quotationDate || new Date();
  const validUntilDate = body.validUntilDate || new Date();

  // Fetch all items from database to get their details
  const itemIds = body.items.map(item => item.itemId);
  const itemsFromDb = await Item.findAll({
    where: { id: itemIds, companyId: body.companyId, isActive: true, isDeleted: false },
    transaction: t,
  });
  const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

  if (itemsFromDb.length !== itemIds.length) {
    throw new Error("One or more items not found or inactive");
  }

  // Fetch company details to get state for tax calculation
  const company = await Company.findByPk(body.companyId, { transaction: t });
  if (!company) {
    throw new Error("Company not found");
  }
  const companyState = company.state || '';

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  // Use shared calculation logic
  const calculated = calculateQuoteTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    body.placeOfSupply,
    companyState,
    body.shippingAmount,
    body.shippingTax,
    body.customAmount,
    body.addDiscountTotal,
    body.tdsTcsEntries
  );

  // Create quote
  const quote = await Quote.create(
    {
      companyId: body.companyId,
      clientId: body.clientId,
      taxSelectionOn: body.taxSelectionOn,
      placeOfSupply: body.placeOfSupply,
      quotationNo: body.quotationNo,
      quotationDate,
      poNo: body.poNo,
      validUntilDate,
      status: 'Open',
      unitId: body.unitId || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountTotal: body.addDiscountTotal,
      addDiscountToAll: body.addDiscountToAll,
      customAmountLabel: body.customAmountLabel || null,
      customAmount: body.customAmount,
      showCess: body.showCess,
      termsConditions: body.termsConditions || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)), // Sum of actual discount amounts
      taxable: calculated.taxable,
      cgst: parseFloat(calculated.totalCgst.toFixed(2)), // Cumulative CGST from items
      sgst: parseFloat(calculated.totalSgst.toFixed(2)), // Cumulative SGST from items
      igst: parseFloat(calculated.totalIgst.toFixed(2)), // Cumulative IGST from items
      cessValue: parseFloat(calculated.totalCess.toFixed(2)), // Cumulative CESS from items
      total: parseFloat(calculated.total.toFixed(2)),
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create quote items
  const createdQuoteItems = await QuoteItem.bulkCreate(
    calculated.quoteItemsData.map(item => ({
      ...item,
      quoteId: quote.id,
    })),
    { transaction: t, validate: true }
  );

    const itemTaxableBase = calculated.subTotal - calculated.finalDiscount;
    const totalConsiderationBase = itemTaxableBase + (body.shippingAmount || 0) + (body.customAmount || 0) - (body.addDiscountTotal || 0);

  // Create TDS/TCS entries if provided
  let createdTdsTcs: any[] = [];
  if (body.tdsTcsEntries && body.tdsTcsEntries.length > 0) {
    
    createdTdsTcs = await QuoteTdsTcs.bulkCreate(
      body.tdsTcsEntries.map(entry => {
        const baseAmount = entry.applicableOn === "total" ? totalConsiderationBase : itemTaxableBase;
        const taxAmount = baseAmount * (entry.taxPercentage / 100);

        return {
          companyId: body.companyId,
          quoteId: quote.id,
          taxPercentage: entry.taxPercentage,
          type: entry.type,
          taxName: entry.taxName,
          applicableOn: entry.applicableOn,
          taxAmount: parseFloat(taxAmount.toFixed(2)),
        };
      }),
      { transaction: t, validate: true }
    );
  }

  return {
    quote,
    quoteItems: createdQuoteItems,
    tdsTcsEntries: createdTdsTcs,
  };
};

// Get quote by ID with all related data
export const getQuoteById = async (id: string, companyId: string) => {
  return await Quote.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: QuoteItem,
        as: "quoteItems",
      },
      {
        model: QuoteTdsTcs,
        as: "tdsTcsEntries",
      },
    ],
  });
};

// Get all quotes for a company
export const getQuotesByCompany = async (companyId: string) => {
  return await Quote.findAll({
    where: { companyId, isDeleted: false },
    order: [["quotationDate", "DESC"]],
  });
};

// Get quotes by client
export const getQuotesByClient = async (clientId: string, companyId: string) => {
  return await Quote.findAll({
    where: { clientId, companyId, isDeleted: false },
    order: [["quotationDate", "DESC"]],
  });
};

// Update quote with full recalculation
export const updateQuote = async (
  id: string,
  companyId: string,
  body: CreateQuoteInput,
  t: Transaction
) => {
  // First, verify the quote exists
  const existingQuote = await Quote.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!existingQuote) {
    throw new Error("Quote not found");
  }

  // Check if quote can be modified
  if (existingQuote.status === "Converted") {
    throw new Error("Converted quotes cannot be modified");
  }

  // Calculate valid until date
  const quotationDate = body.quotationDate || existingQuote.quotationDate;
  const validUntilDate = body.validUntilDate || existingQuote.validUntilDate;

  // Fetch all items from database to get their details
  const itemIds = body.items.map(item => item.itemId);
  const itemsFromDb = await Item.findAll({
    where: { id: itemIds, companyId: body.companyId, isActive: true, isDeleted: false },
    transaction: t,
  });
  const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

  if (itemsFromDb.length !== itemIds.length) {
    throw new Error("One or more items not found or inactive");
  }

  // Fetch company details to get state for tax calculation
  const company = await Company.findByPk(body.companyId, { transaction: t });
  if (!company) {
    throw new Error("Company not found");
  }
  const companyState = company.state || '';

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  // Use shared calculation logic
  const calculated = calculateQuoteTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    body.placeOfSupply,
    companyState,
    body.shippingAmount,
    body.shippingTax,
    body.customAmount,
    body.addDiscountTotal,
    body.tdsTcsEntries
  );

  // Update the quote
  await Quote.update(
    {
      clientId: body.clientId,
      taxSelectionOn: body.taxSelectionOn,
      placeOfSupply: body.placeOfSupply,
      quotationNo: body.quotationNo,
      quotationDate,
      poNo: body.poNo,
      validUntilDate,
      unitId: body.unitId || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountTotal: body.addDiscountTotal,
      addDiscountToAll: body.addDiscountToAll,
      customAmountLabel: body.customAmountLabel || null,
      customAmount: body.customAmount,
      showCess: body.showCess,
      termsConditions: body.termsConditions || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)), // Sum of actual discount amounts
      cgst: parseFloat(calculated.totalCgst.toFixed(2)), // Cumulative CGST from items
      sgst: parseFloat(calculated.totalSgst.toFixed(2)), // Cumulative SGST from items
      igst: parseFloat(calculated.totalIgst.toFixed(2)), // Cumulative IGST from items
      cessValue: parseFloat(calculated.totalCess.toFixed(2)), // Cumulative CESS from items
      total: parseFloat(calculated.total.toFixed(2)),
    },
    {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    }
  );

  // Delete existing quote items and TDS/TCS entries
  await QuoteItem.destroy({
    where: { quoteId: id },
    transaction: t,
  });

  await QuoteTdsTcs.destroy({
    where: { quoteId: id },
    transaction: t,
  });

  // Create new quote items
  await QuoteItem.bulkCreate(
    calculated.quoteItemsData.map(item => ({
      ...item,
      quoteId: id,
    })),
    { transaction: t, validate: true }
  );

  if (body.tdsTcsEntries){
    await QuoteTdsTcs.destroy({ where: { quoteId: id }, transaction: t });
    if (body.tdsTcsEntries.length > 0) {
      // Calculate base amounts for TDS/TCS
        const itemTaxableBase = calculated.subTotal - calculated.finalDiscount;
        const totalConsiderationBase = itemTaxableBase + (body.shippingAmount || 0) + (body.customAmount || 0) - (body.addDiscountTotal || 0);
      await QuoteTdsTcs.bulkCreate(
        body.tdsTcsEntries.map(entry => {
          const baseAmount = entry.applicableOn === "total" ? totalConsiderationBase : itemTaxableBase;
          const taxAmount = baseAmount * (entry.taxPercentage / 100);

          return {
            companyId: body.companyId,
            quoteId: id,
            taxPercentage: entry.taxPercentage,
            type: entry.type,
            taxName: entry.taxName,
            applicableOn: entry.applicableOn || 'total',
            taxAmount: parseFloat(taxAmount.toFixed(2)),
          };
        }),
        { transaction: t, validate: true }
      );
    }
  } 

  return [1];
};

// Soft delete quote
export const deleteQuote = async (id: string, companyId: string, t: Transaction) => {
  return await Quote.update(
    { isActive: false, isDeleted: true },
    { where: { id, companyId, isDeleted: false }, transaction: t }
  );
};

// Search quotes with filters
export interface SearchQuoteFilters {
  companyId: string;
  clientName?: string;
  quotationNo?: string;
  status?: string;
  city?: string;
  itemName?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

export const searchQuotes = async (filters: SearchQuoteFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by quote number
  if (filters.quotationNo) {
    whereConditions.quoteNo = {
      [Op.like]: `%${filters.quotationNo}%`,
    };
  }

  // Filter by status
  if (filters.status) {
    whereConditions.status = filters.status;
  }

  // Filter by issue date range
  if (filters.issueDateFrom || filters.issueDateTo) {
    const dateFilter: any = {};
    if (filters.issueDateFrom) dateFilter[Op.gte] = filters.issueDateFrom;
    if (filters.issueDateTo) dateFilter[Op.lte] = filters.issueDateTo;
    whereConditions.quotationDate = dateFilter;
  }

  // Filter by due date range
  if (filters.dueDateFrom || filters.dueDateTo) {
    const dateFilter: any = {};
    if (filters.dueDateFrom) dateFilter[Op.gte] = filters.dueDateFrom;
    if (filters.dueDateTo) dateFilter[Op.lte] = filters.dueDateTo;
    whereConditions.validUnilDate = dateFilter;
  }

  // Build include array for associations
  const includeArray: any[] = [
    {
      model: QuoteItem,
      as: "QuoteItems",
    },
    {
      model: QuoteTdsTcs,
      as: "tdsTcsEntries",
    },
  ];

  // Filter by client name
  const clientWhere: any = {};
  if (filters.clientName) {
    clientWhere[Op.or] = [
      { clientfirstName: { [Op.like]: `%${filters.clientName}%` } },
      { clientLastName: { [Op.like]: `%${filters.clientName}%` } },
      { businessName: { [Op.like]: `%${filters.clientName}%` } },
    ];
  }

  // Filter by city (from client)
  if (filters.city) {
    clientWhere.city = {
      [Op.like]: `%${filters.city}%`,
    };
  }

  // Add client to include if there are client filters
  if (Object.keys(clientWhere).length > 0) {
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

  // Filter by item name
  if (filters.itemName) {
    includeArray[0] = {
      model: QuoteItem,
      as: "quoteItems",
      where: {
        itemName: {
          [Op.like]: `%${filters.itemName}%`,
        },
      },
      required: true,
    };
  }

  return await Quote.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["quotationDate", "DESC"]],
    subQuery: false,
  });
};

// Convert Quote to Invoice
export const convertQuoteToInvoice = async (
  quoteId: string,
  companyId: string,
  invoiceData: {
    invoiceType: InvoiceType;
    invoiceNo: string;
    invoiceDate?: Date;
    poNo: string;
    poDate?: Date;
    paymentTerms: PaymentTerms;
    specificDueDate?: Date;
  },
  t: Transaction
) => {
  // Fetch the quote with all related data
  const quote = await Quote.findOne({
    where: { id: quoteId, companyId, isDeleted: false },
    include: [
      {
        model: QuoteItem,
        as: "quoteItems",
      },
      {
        model: QuoteTdsTcs,
        as: "tdsTcsEntries",
      },
    ],
  });

  if (!quote) {
    throw new Error("Quote not found");
  }

  if (quote.status === "Converted") {
    throw new Error("Quote has already been converted to an invoice");
  }

  // Calculate due date
  const invoiceDate = invoiceData.invoiceDate || new Date();
  const dueDate = calculateDueDate(
    invoiceDate,
    invoiceData.paymentTerms,
    invoiceData.specificDueDate
  );

  // Create invoice from quote data
  const invoice = await Invoice.create(
    {
      companyId: quote.companyId,
      invoiceType: invoiceData.invoiceType,
      clientId: quote.clientId,
      taxSelectionOn: quote.taxSelectionOn,
      placeOfSupply: quote.placeOfSupply,
      invoiceNo: invoiceData.invoiceNo,
      invoiceDate,
      poNo: invoiceData.poNo,
      poDate: invoiceData.poDate || new Date(),
      dueDate,
      status: 'Unpaid',
      paymentTerms: invoiceData.paymentTerms,
      unitId: quote.unitId,
      shippingChargeType: quote.shippingChargeType,
      shippingAmount: quote.shippingAmount,
      shippingTax: quote.shippingTax,
      addDiscountTotal: quote.addDiscountTotal,
      addDiscountToAll: quote.addDiscountToAll,
      customAmountLabel: quote.customAmountLabel,
      customAmount: quote.customAmount,
      showCess: quote.showCess,
      cessValue: quote.cessValue,
      reverseCharge: false,
      termsConditions: quote.termsConditions,
      privateNotes: quote.privateNotes,
      subTotal: quote.subTotal,
      finalDiscount: 0,
      cgst: quote.cgst,
      sgst: quote.sgst,
      igst: quote.igst,
      total: quote.total,
      balance: quote.total, // Initially balance equals total
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create invoice items from quote items
  const quoteItems = (quote as any).quoteItems || [];
  const invoiceItems = await InvoiceItem.bulkCreate(
    quoteItems.map((item: any) => ({
      invoiceId: invoice.id,
      itemId: item.itemId,
      itemName: item.itemName,
      description: item.description,
      hsn: item.hsn,
      sac: item.sac,
      unitId: item.unitId,
      tax: item.tax,
      cessPercentage: item.cessPercentage,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxAmount: item.taxAmount,
      totalAmount: item.totalAmount,
    })),
    { transaction: t, validate: true }
  );

  // Create TDS/TCS entries from quote
  const quoteTdsTcs = (quote as any).tdsTcsEntries || [];
  let invoiceTdsTcs: any[] = [];
  if (quoteTdsTcs.length > 0) {
    invoiceTdsTcs = await InvoiceTdsTcs.bulkCreate(
      quoteTdsTcs.map((entry: any) => ({
        companyId: quote.companyId,
        invoiceId: invoice.id,
        taxPercentage: entry.taxPercentage,
        type: entry.type,
        taxName: entry.taxName,
        applicableOn: entry.applicableOn,
      })),
      { transaction: t, validate: true }
    );
  }

  // Update quote status to "Converted"
  await Quote.update(
    { status: "Converted" },
    { where: { id: quoteId }, transaction: t }
  );

  return {
    invoice,
    invoiceItems,
    tdsTcsEntries: invoiceTdsTcs,
    convertedFromQuote: quoteId,
  };
};