import { Op, Transaction } from "sequelize";
import { Quote } from "./quote-model";
import { QuoteItem } from "./quote-item-model";
import { Item } from "../item/item-model";
import { QuoteTdsTcs } from "./tds-tcs/quote-tds-tcs-model";
import { Company } from "../../company/company-model";
import { TaxSelection } from "./quote-model";
import { calculateDueDate, InvoiceType, CreateInvoiceInput } from "../invoice/invoice-handler";
import { Invoice, PaymentTerms } from "../invoice/invoice-model";
import { InvoiceItem } from "../invoice/invoice-item-model";
import { InvoiceTdsTcs } from "../invoice/tds-tcs/invoice-tds-tcs-model";
import { createInvoice } from "../invoice/invoice-handler";
import { Clients } from "../../agency/clients/clients-model";
import { sendEmail } from "../../../../services/mailService";
import crypto from "crypto";
import { PaymentsDocuments } from "../payments/payments-documents-model";
import { Payments } from "../payments/payments-model";

// Helper function to check if two states are the same
const isSameState = (placeOfSupply: string | undefined, companyState: string | undefined): boolean => {
  const p = (placeOfSupply ?? '').toString().trim();
  const c = (companyState ?? '').toString().trim();
  if (!p || !c) return false;
  const pLower = p.toLowerCase();
  const cLower = c.toLowerCase();

  // Direct substring match
  if (pLower.includes(cLower) || cLower.includes(pLower)) return true;

  // State abbreviation to full name mapping
  const stateCodeMap: Record<string, string> = {
    AN: 'andaman', AP: 'andhra', AR: 'arunachal', AS: 'assam', BR: 'bihar', CH: 'chandigarh', CT: 'chhattisgarh',
    DL: 'delhi', GA: 'goa', GJ: 'gujarat', HP: 'himachal', HR: 'haryana', JH: 'jharkhand', JK: 'jammu',
    KA: 'karnataka', KL: 'kerala', LA: 'ladakh', MH: 'maharashtra', ML: 'meghalaya', MN: 'manipur',
    MP: 'madhya', MZ: 'mizoram', NL: 'nagaland', OR: 'odisha', PB: 'punjab', PY: 'puducherry',
    RJ: 'rajasthan', SK: 'sikkim', TN: 'tamil', TR: 'tripura', TS: 'telangana', UP: 'uttar', UK: 'uttarakhand', WB: 'west'
  };

  // Extract 2-letter state code from place (handles 'GJ (24)', 'AS (18)', etc.)
  const codeMatchPlace = p.match(/^([A-Za-z]{2})\s*\(/);
  if (codeMatchPlace) {
    const code = codeMatchPlace[1].toUpperCase();
    const mapped = stateCodeMap[code];
    if (mapped && cLower.includes(mapped)) return true;
  }

  return false;
};

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

    // Use item tax from database, default to 18% if not set (9% CGST + 9% SGST)
    const itemTax = itemFromDb.tax !== null && itemFromDb.tax !== undefined ? itemFromDb.tax : 18;
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

    const isInterstate = !isSameState(placeOfSupply, companyState);
    const taxTotals = applyTaxSplit(amountForTax, itemTax, isInterstate, {
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
      if (!isSameState(placeOfSupply, companyState)) {
        totalIgst += shippingTaxAmount;
      } else {
        totalCgst += shippingTaxAmount / 2;
        totalSgst += shippingTaxAmount / 2;
      }
    }
  }

  const customAmountValue = customAmount || 0;
  const discountOnTotal = addDiscountTotal || 0;
  // Total before applying TDS/TCS (this includes shipping/custom and discount adjustments)
  const totalBeforeTdsTcs = subTotal + totalCgst + totalSgst + totalIgst + totalCess - finalDiscount + (shippingAmount || 0) + customAmountValue - discountOnTotal;

  // Calculate TDS and TCS amounts
  let totalTds = 0;
  let totalTcs = 0;
  const taxableBase = subTotal - finalDiscount;
  // TDS/TCS base should include taxable + tax amounts + cess, but NOT shipping/custom/discount-on-total (invoice-compatible)
  const totalBase = taxableBase
        + totalCgst
        + totalSgst
        + totalIgst
        + totalCess;
  if (tdsTcsEntries && tdsTcsEntries.length > 0) {
    tdsTcsEntries.forEach(entry => {

      let baseAmount = 0;
      if (entry.applicableOn === "taxable") {
        baseAmount = taxableBase;
      }

      if (entry.applicableOn === "total") {
        baseAmount = totalBase;
      }

      const taxAmount = parseFloat(
        (baseAmount * entry.taxPercentage / 100).toFixed(2)
      );

      if (entry.type.toLowerCase() === "tds") {
        totalTds += taxAmount;
      }

      if (entry.type.toLowerCase() === "tcs") {
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

  console.log('Quote calculation result:', {
    subTotal: calculated.subTotal,
    finalDiscount: calculated.finalDiscount,
    totalCgst: calculated.totalCgst,
    totalSgst: calculated.totalSgst,
    totalIgst: calculated.totalIgst,
    totalCess: calculated.totalCess,
    total: calculated.total,
    itemCount: body.items.length,
    itemsFromDb: itemsFromDb.map(i => ({ id: i.id, name: i.itemName, tax: i.tax, unitPrice: i.unitPrice }))
  });

  // Generate a unique publicToken
  const publicToken = crypto.randomBytes(32).toString("hex");
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
      publicToken,
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

    // Calculate base amounts for TDS/TCS (should match the calculation logic)
  const taxableBase = calculated.subTotal - calculated.finalDiscount;

  const totalBase = taxableBase
        + calculated.totalCgst
        + calculated.totalSgst
        + calculated.totalIgst
        + calculated.totalCess
        + (body.shippingAmount || 0)
        + (body.customAmount || 0)
        - (body.addDiscountTotal || 0);


  // Create TDS/TCS entries if provided
  let createdTdsTcs: any[] = [];
  if (body.tdsTcsEntries && body.tdsTcsEntries.length > 0) {

    createdTdsTcs = await QuoteTdsTcs.bulkCreate(
      body.tdsTcsEntries.map(entry => {
        const baseAmount = entry.applicableOn === "total" ? totalBase : taxableBase;
        const taxAmount = baseAmount * (entry.taxPercentage / 100);

        return {
          companyId: body.companyId,
          quoteId: quote.id,
          taxPercentage: entry.taxPercentage,
          type: entry.type,
          taxName: entry.taxName,
          applicableOn: entry.applicableOn,
          taxAmount: parseFloat(taxAmount.toFixed(2)),
          isActive: true,
          isDeleted: false,
        };
      }),
      { transaction: t, validate: true }
    );
  }

  // sending email to the client about quote created
  const client = await Clients.findOne({
    where: {
      id: quote.clientId
    }
  })
  if (client && client.email) {
    try {
      // Prepare display-friendly values
      const clientName = client.clientfirstName || 'Customer';
      const expiryDate = quote.validUntilDate ? new Date(quote.validUntilDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      const quoteAmount = typeof quote.total === 'number' ? quote.total.toFixed(2) : (quote.total || '0');
      const baseUrl = process.env.ADMIN_URL || process.env.BASE_URL || process.env.APP_BASE_URL || '';
      if (!baseUrl) console.warn('ADMIN_URL not set — sending relative public-quote link in email for quote', quote.id);
      const normalizedBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
      const quoteLink = normalizedBase ? `${normalizedBase}/public-quote/${quote.publicToken}` : `/public-quote/${quote.publicToken}`;

      await sendEmail({
        from: "" as any,
        to: client.email,
        subject: `Quote ${quote.quotationNo}`,
        htmlFile: "quote-created",
        replacements: {
          clientName,
          quoteNo: quote.quotationNo,
          expiryDate,
          quoteAmount,
          quoteLink,
          currentYear: new Date().getFullYear(),
        },
        html: null,
        text: "",
        attachments: null,
        cc: null,
        replyTo: null,
      });
    } catch (emailError) {
      // Log email error but don't fail the quote creation
      console.error('Failed to send quote creation email:', emailError);
    }
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
        model: Company,
        as: "company",
      },
      {
        model: Clients,
        as: "client",
      },
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
    include: [
      {
        model: Clients,
        as: "client",
      },
    ],
    order: [["quotationDate", "DESC"]],
  });
};

// Get quotes by client
export const getQuotesByClient = async (clientId: string, companyId: string) => {
  return await Quote.findAll({
    where: { clientId, companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
      },
    ],
    order: [["quotationDate", "DESC"]],
  });
};

// Update quote with full recalculation
export const updateQuote = async (
  id: string,
  companyId: string,
  body: any,
  t: Transaction
) => {
  // Check if items or numerical values are being updated
  const needsRecalculation = body.items || body.shippingAmount !== undefined ||
    body.shippingTax !== undefined || body.addDiscountTotal !== undefined ||
    body.addDiscountToAll !== undefined || body.customAmount !== undefined ||
    body.showCess !== undefined || body.tdsTcsEntries;

  if(needsRecalculation){
    // First, verify the quote exists
    const existingQuote = await Quote.findOne({
      where: { id, companyId, isDeleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [
        { model: QuoteItem, as: "quoteItems" },
        { model: QuoteTdsTcs, as: "tdsTcsEntries" },
      ]
    });

    if (!existingQuote) {
      throw new Error("Quote not found");
    }

    // Check if quote can be modified
    if (existingQuote.status === "Converted") {
      throw new Error("Converted quotes cannot be modified");
    }

    // Merge body with existing invoice data
    const mergedData = {
      ...existingQuote.toJSON(),
      ...body,
      items: body.items || (existingQuote as any).quoteItems?.map((item: any) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        discount: item.discount,
      })) || [],
    };

    // Calculate valid until date
    const quotationDate = body.quotationDate || existingQuote.quotationDate;
    const validUntilDate = body.validUntilDate || existingQuote.validUntilDate;

    // Fetch all items from database to get their details
    const itemIds = mergedData.items.map((item: any) => item.itemId);
    const itemsFromDb = await Item.findAll({
      where: { id: itemIds, companyId, isActive: true, isDeleted: false }
    });
    const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

    if (itemsFromDb.length !== itemIds.length) {
      throw new Error("One or more items not found or inactive");
    }

    // Fetch company details to get state for tax calculation
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new Error("Company not found");
    }
    const companyState: string = company.state ?? '';

    // Validate that all items have unitId
    const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
    if (itemsWithoutUnit.length > 0) {
      throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
    }

    // Use shared calculation logic
    const calculated = calculateQuoteTotals(
      mergedData.items,
      itemMap,
      mergedData.addDiscountToAll,
      mergedData.showCess,
      mergedData.placeOfSupply,
      companyState,
      mergedData.shippingAmount,
      mergedData.shippingTax,
      mergedData.customAmount,
      mergedData.addDiscountTotal,
      mergedData.tdsTcsEntries
    );

    // Update the quote
    await Quote.update(
      {
        ...body,
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
      if (mergedData.tdsTcsEntries.length > 0) {
        // Calculate base amounts for TDS/TCS
        const taxableBase = calculated.subTotal - calculated.finalDiscount;
        const totalBase = taxableBase
                + calculated.totalCgst
                + calculated.totalSgst
                + calculated.totalIgst
                + calculated.totalCess
                + (body.shippingAmount || 0)
                + (body.customAmount || 0)
                - (body.addDiscountTotal || 0);

        await QuoteTdsTcs.bulkCreate(
          mergedData.tdsTcsEntries.map((entry: any) => {
            const baseAmount = entry.applicableOn === "total" ? totalBase : taxableBase;
            const taxAmount = baseAmount * (entry.taxPercentage / 100);

            return {
              companyId: body.companyId,
              quoteId: id,
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
    }
  } else {
    await Quote.update(body, {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    });
    return await getQuoteById(id,companyId);
  }

  return [1];
};

// Soft delete quote
export const deleteQuote = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Fetch quote with lock
  const quote = await Quote.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!quote) {
    throw new Error("Quote not found");
  }

  // Status validation
  if (quote.status === "Converted") {
    throw new Error(
      "Converted quotes cannot be deleted"
    );
  }

  // Soft delete quote items
  await QuoteItem.update(
    { isActive: false, isDeleted: true },
    {
      where: { quoteId: id },
      transaction: t,
    }
  );

  // Soft delete TDS/TCS entries
  await QuoteTdsTcs.update(
    { isActive: false,  isDeleted: true },
    {
      where: { quoteId: id },
      transaction: t,
    }
  );

  // Soft delete quote itself
  await Quote.update(
    {
      isActive: false,
      isDeleted: true,
      status: "Cancelled",
    },
    {
      where: { id, companyId },
      transaction: t,
    }
  );

  return {
    success: true,
    message: "Quote deleted successfully",
    quoteId: id,
  };
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
    whereConditions.quotationNo = {
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
    whereConditions.validUntilDate = dateFilter;
  }

  // Build include array for associations
  const includeArray: any[] = [
    {
      model: Company,
      as: "company",
    },
    {
      model: Clients,
      as: "client",
    },
    {
      model: QuoteItem,
      as: "quoteItems",
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
  body: any,
  t: Transaction
) => {
  // Fetch quote with all related data
  const quote = await Quote.findOne({
    where: { id: quoteId, companyId, isDeleted: false },
    include: [
      { model: QuoteItem, as: "quoteItems" },
      { model: QuoteTdsTcs, as: "tdsTcsEntries" },
    ],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!quote) {
    throw new Error("Quote not found");
  }

  if (quote.status === "Converted") {
    throw new Error("Quote has already been converted to an invoice");
  }

  // Validate required fields
  if (!body.invoiceNo || !body.poNo || !body.paymentTerms) {
    throw new Error("invoiceNo, poNo and paymentTerms are required to convert quote to invoice");
  }

  const quoteItems = (quote as any).quoteItems || [];
  const quoteTdsTcs = (quote as any).tdsTcsEntries || [];

  // Helper function to safely convert to number or return undefined
  const toNumber = (val: any): number | undefined => {
    if (val === undefined || val === null || val === "") return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  };

  // Prepare items for invoice (use body items if provided, otherwise use quote items)
  const invoiceItems = body.items && body.items.length > 0
    ? body.items.map((item: any) => ({
        itemId: item.itemId,
        quantity: toNumber(item.quantity) ?? 1,
        discount: toNumber(item.discount) ?? 0,
      }))
    : quoteItems.map((qi: any) => ({
        itemId: qi.itemId,
        quantity: toNumber(qi.quantity) ?? 1,
        discount: toNumber(qi.discount) ?? 0,
      }));

  if (!invoiceItems || invoiceItems.length === 0) {
    throw new Error("Invoice must contain at least one item");
  }

  // Prepare TDS/TCS entries (use body entries if provided, otherwise use quote entries)
  const tdsTcsEntries = body.tdsTcsEntries && body.tdsTcsEntries.length > 0
    ? body.tdsTcsEntries.map((e: any) => ({
        taxPercentage: toNumber(e.taxPercentage) ?? 0,
        type: e.type,
        taxName: e.taxName,
        applicableOn: e.applicableOn ?? "taxable",
      }))
    : quoteTdsTcs.map((e: any) => ({
        taxPercentage: toNumber(e.taxPercentage) ?? 0,
        type: e.type,
        taxName: e.taxName,
        applicableOn: e.applicableOn ?? "taxable",
      }));

  // Build invoice input object with proper data types and fallbacks
  const invoiceInput: CreateInvoiceInput = {
    companyId,
    invoiceType: (body.invoiceType as InvoiceType) ?? "tax Invoice",
    clientId: body.clientId ?? quote.clientId,
    taxSelectionOn: (body.taxSelectionOn as TaxSelection) ?? quote.taxSelectionOn,
    placeOfSupply: body.placeOfSupply ?? quote.placeOfSupply,
    invoiceNo: body.invoiceNo,
    invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
    poNo: body.poNo,
    poDate: body.poDate ? new Date(body.poDate) : new Date(),
    paymentTerms: body.paymentTerms as PaymentTerms,
    specificDueDate: body.specificDueDate ? new Date(body.specificDueDate) : undefined,
    items: invoiceItems,
    unitId: body.unitId ?? quote.unitId ?? undefined,
    shippingChargeType: body.shippingChargeType ?? quote.shippingChargeType ?? undefined,
    shippingAmount: toNumber(body.shippingAmount) ?? toNumber(quote.shippingAmount) ?? undefined,
    shippingTax: toNumber(body.shippingTax) ?? toNumber(quote.shippingTax) ?? undefined,
    addDiscountTotal: toNumber(body.addDiscountTotal) ?? toNumber(quote.addDiscountTotal) ?? undefined,
    addDiscountToAll: toNumber(body.addDiscountToAll) ?? toNumber(quote.addDiscountToAll) ?? undefined,
    customAmountLabel: body.customAmountLabel ?? quote.customAmountLabel ?? undefined,
    customAmount: toNumber(body.customAmount) ?? toNumber(quote.customAmount) ?? undefined,
    showCess: body.showCess !== undefined ? Boolean(body.showCess) : Boolean(quote.showCess),
    reverseCharge: body.reverseCharge !== undefined ? Boolean(body.reverseCharge) : false,
    tdsTcsEntries: tdsTcsEntries.length > 0 ? tdsTcsEntries : undefined,
    eWayBillNo: body.eWayBillNo ?? undefined,
    dispatchFrom: body.dispatchFrom ?? undefined,
    lrNo: body.lrNo ?? undefined,
    challanNo: body.challanNo ?? undefined,
    vehicleNo: body.vehicleNo ?? undefined,
    transportMode: body.transportMode ?? undefined,
    transactionType: body.transactionType ?? undefined,
    shippingDistanceInKm: toNumber(body.shippingDistanceInKm) ?? undefined,
    transporterName: body.transporterName ?? undefined,
    transporterId: toNumber(body.transporterId) ?? undefined,
    transporterGstin: body.transporterGstin ?? undefined,
    transporterDocDate: body.transporterDocDate ? new Date(body.transporterDocDate) : undefined,
    transporterDocNo: toNumber(body.transporterDocNo) ?? undefined,
    termsConditions: body.termsConditions ?? quote.termsConditions ?? undefined,
    privateNotes: body.privateNotes ?? quote.privateNotes ?? undefined,
  };

  // Create the invoice using the invoice creation handler
  const result = await createInvoice(invoiceInput, t);

  // Mark quote as converted
  await Quote.update(
    {
      status: "Converted",
    },
    { where: { id: quoteId }, transaction: t }
  );

  return {
    invoice: result.invoice,
    invoiceItems: result.invoiceItems,
    tdsTcsEntries: result.invoiceTdsTcs,
    convertedFromQuote: quoteId,
  };
};

export const getPendingQuoteAmount = async (
  clientId: string,
  companyId: string,
) => {
  // Validate client exists
  const client = await Clients.findOne({
    where: { id: clientId, isDeleted: false }
  });
  
  if (!client) {
    throw new Error("Client not found");
  }
  
  // Validate company exists
  const company = await Company.findOne({
    where: { id: companyId, isActive: true }
  });
  
  if (!company) {
    throw new Error("Company not found");
  }
  
  // Fetch all pending quotes for the client in the company
  const pendingQuotes = await Quote.findAll({
    where: {
      clientId,
      companyId,
      isDeleted: false,
      status: {
        [Op.in]: ["Open", "Draft"]
      }
    },
    include: [
      {
        model: Clients,
        as: "client",
        attributes: ["id", "businessName", "email"]
      },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"]
      }
    ],
    order: [["quotationDate", "ASC"]]
  });
  
  // Calculate total pending quote amount
  const totalPendingAmount = pendingQuotes.reduce((sum, quote) => {
    return sum + (Number(quote.total) || 0);
  }, 0);
  
  // Prepare detailed quote information
  const quoteDetails = pendingQuotes.map((quote) => {
    return {
      quoteId: quote.id,
      quotationNo: quote.quotationNo,
      quotationDate: quote.quotationDate,
      validUntilDate: quote.validUntilDate,
      status: quote.status,
      totalAmount: quote.total,
      subTotal: quote.subTotal,
      taxable: quote.taxable,
      cgst: quote.cgst,
      sgst: quote.sgst,
      igst: quote.igst
    };
  });
  
  return {
    clientId,
    companyId,
    clientName: client.clientfirstName,
    companyName: company.name,
    totalPendingAmount: parseFloat(totalPendingAmount.toFixed(2)),
    pendingQuotesCount: pendingQuotes.length,
    quotes: quoteDetails
  };
};

// Get quote by public token (public preview)
export const getQuoteByPublicToken = async (publicToken: string) => {
  return await Quote.findOne({
    where: { publicToken, isDeleted: false },
    include: [
      { model: QuoteItem, as: "quoteItems" },
      { model: QuoteTdsTcs, as: "tdsTcsEntries" },
      { model: Clients, as: "client" },
      { model: Company, as: "company" },
    ],
  });
};