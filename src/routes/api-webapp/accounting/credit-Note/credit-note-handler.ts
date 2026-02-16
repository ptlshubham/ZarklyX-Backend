import { Op, Transaction } from "sequelize";
import { CreditNote } from "./credit-note-model";
import { CreditNoteItem } from "./credit-note-item-model";
import { Item } from "../item/item-model";
import { Company } from "../../company/company-model";
import { Clients } from "../../agency/clients/clients-model";
import { sendEmail } from "../../../../services/mailService";
import crypto from "crypto";
import { Invoice } from "../invoice/invoice-model";
import { addCreditNoteLedger, deleteLedgerByReference } from "../client-ledger/client-ledger-handler";

// // Robust state comparison: handles 'Gujarat', 'GUJARAT', 'GJ (24)', 'GJ', etc
// const isSameState = (placeOfSupply: string | undefined, companyState: string | undefined): boolean => {
//   const p = (placeOfSupply ?? '').toString().trim();
//   const c = (companyState ?? '').toString().trim();
//   if (!p || !c) return false;
//   const pLower = p.toLowerCase();
//   const cLower = c.toLowerCase();
  
//   // Direct substring match
//   if (pLower.includes(cLower) || cLower.includes(pLower)) return true;
  
//   // State abbreviation to full name mapping
//   const stateCodeMap: Record<string, string> = {
//     AN: 'andaman', AP: 'andhra', AR: 'arunachal', AS: 'assam', BR: 'bihar', CH: 'chandigarh', CT: 'chhattisgarh',
//     DL: 'delhi', GA: 'goa', GJ: 'gujarat', HP: 'himachal', HR: 'haryana', JH: 'jharkhand', JK: 'jammu',
//     KA: 'karnataka', KL: 'kerala', LA: 'ladakh', MH: 'maharashtra', ML: 'meghalaya', MN: 'manipur',
//     MP: 'madhya', MZ: 'mizoram', NL: 'nagaland', OR: 'odisha', PB: 'punjab', PY: 'puducherry',
//     RJ: 'rajasthan', SK: 'sikkim', TN: 'tamil', TR: 'tripura', TS: 'telangana', UP: 'uttar', UK: 'uttarakhand', WB: 'west'
//   };
  
//   // Extract 2-letter state code from place (handles 'GJ (24)', 'AS (18)', etc.)
//   const codeMatchPlace = p.match(/^([A-Za-z]{2})\s*\(/);
//   if (codeMatchPlace) {
//     const code = codeMatchPlace[1].toUpperCase();
//     const mapped = stateCodeMap[code];
//     if (mapped && cLower.includes(mapped)) return true;
//   }
  
//   // Also check if place is just the state code or code-like pattern
//   const justCodeMatch = p.match(/^([A-Za-z]{2})(\s|$)/i);
//   if (justCodeMatch) {
//     const code = justCodeMatch[1].toUpperCase();
//     const mapped = stateCodeMap[code];
//     if (mapped && cLower.includes(mapped)) return true;
//   }
  
//   // Try to extract any 2-letter sequence and match against codes
//   for (const [code, stateName] of Object.entries(stateCodeMap)) {
//     if (pLower.includes(code.toLowerCase()) || pLower.startsWith(code.toLowerCase())) {
//       if (cLower.includes(stateName)) return true;
//     }
//   }
  
//   return false;
// };

// Robust state comparison: handles 'Gujarat', 'GUJARAT', 'GJ (24)', 'GJ', etc
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
  
  // Also check if place is just the state code or code-like pattern
  const justCodeMatch = p.match(/^([A-Za-z]{2})(\s|$)/i);
  if (justCodeMatch) {
    const code = justCodeMatch[1].toUpperCase();
    const mapped = stateCodeMap[code];
    if (mapped && cLower.includes(mapped)) return true;
  }
  
  // Try to extract any 2-letter sequence and match against codes
  for (const [code, stateName] of Object.entries(stateCodeMap)) {
    if (pLower.includes(code.toLowerCase()) || pLower.startsWith(code.toLowerCase())) {
      if (cLower.includes(stateName)) return true;
    }
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

interface CreditCalculationResult {
  subTotal: number;
  finalDiscount: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  total: number;
  creditNoteItemsData: any[];
}

interface CreateCreditNoteInput {
  companyId: string;
  clientId: string;
  taxSelectionOn: string;
  placeOfSupply: string;
  creditNo: string;
  invoiceId: string;
  invoiceDate?: Date;
  creditDate?: Date;
  reason: string;
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
  unitQuantity?: number;
  shippingChargeType?: string;
  shippingAmount?: number;
  shippingTax?: number;
  addDiscountToAll?: number; // Discount distributed to all items (percentage)
  showCess: boolean;
  notes?: string;
  privateNotes?: string;
}

// Shared calculation logic for credit note totals
const calculateCreditNoteTotals = (
  items: any[],
  itemMap: Map<string, any>,
  addDiscountToAll: number | undefined,
  showCess: boolean,
  isTaxInvoice: boolean,
  placeOfSupply: string,
  companyState: string,
  shippingAmount: number | undefined,
  shippingTax: number | undefined
): CreditCalculationResult => {
  let subTotal = 0;
  let finalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const creditNoteItemsData = items.map((inputItem) => {
    const itemFromDb = itemMap.get(inputItem.itemId);
    if (!itemFromDb) throw new Error(`Item ${inputItem.itemId} not found`);

    const effectiveDiscountPercentage = addDiscountToAll !== undefined && addDiscountToAll !== null
      ? addDiscountToAll
      : (inputItem.discount || 0);

    const itemTax = isTaxInvoice ? (itemFromDb.tax || 0) : 0;
    const cessTax = isTaxInvoice && showCess ? (itemFromDb.cessPercentage || 0) : 0;

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

    const taxTotals = applyTaxSplit(amountForTax, itemTax, !isSameState(placeOfSupply, companyState), {
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
    });
    totalCgst = taxTotals.cgst;
    totalSgst = taxTotals.sgst;
    totalIgst = taxTotals.igst;

    if (isTaxInvoice && showCess && cessTax > 0) {
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
    if (isTaxInvoice && shippingTax) {
      const shippingTaxAmount = shippingAmount * (shippingTax / 100);
      if (!isSameState(placeOfSupply, companyState)) {
        totalIgst += shippingTaxAmount;
      } else {
        totalCgst += shippingTaxAmount / 2;
        totalSgst += shippingTaxAmount / 2;
      }
    }
  }

  const total = subTotal + totalCgst + totalSgst + totalIgst + totalCess - finalDiscount + (shippingAmount || 0);
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
    creditNoteItemsData,
  };
};

// Create credit note with all related data
export const createCreditNote = async (body: CreateCreditNoteInput, t: Transaction) => {
  // Generate a unique publicToken
  const publicToken = crypto.randomBytes(32).toString("hex");
  const creditDate = body.creditDate || new Date();
  const invoiceDate = body.invoiceDate || new Date();

  // Fetch all items from database to get their details
  const itemIds = body.items.map(item => item.itemId);
  const itemsFromDb = await Item.findAll({
    where: { id: itemIds, companyId: body.companyId, isActive: true, isDeleted: false }
  });
  const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

  if (itemsFromDb.length !== itemIds.length) {
    throw new Error("One or more items not found or inactive");
  }

  // Fetch company details to get state for tax calculation
  const company = await Company.findByPk(body.companyId);
  if (!company) {
    throw new Error("Company not found");
  }
  const companyState = company.state ?? "";

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  // Credit notes always apply tax (same as tax invoice)
  const isTaxApplicable = true;
  
  const calculated = calculateCreditNoteTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    isTaxApplicable,
    body.placeOfSupply,
    companyState,
    body.shippingAmount,
    body.shippingTax,
  )

  // Create credit note
  const creditNote = await CreditNote.create(
    {
      companyId: body.companyId,
      clientId: body.clientId,
      taxSelectionOn: body.taxSelectionOn,
      placeOfSupply: body.placeOfSupply,
      creditNo: body.creditNo,
      invoiceId: body.invoiceId,
      invoiceDate,
      creditDate,
      reason: body.reason,
      unitId: body.unitId || null,
      totalQuantity: body.unitQuantity || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountToAll: body.addDiscountToAll,
      showCess: body.showCess,
      notes: body.notes || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)), // Sum of actual discount amounts
      taxable: calculated.taxable,
      cgst: parseFloat(calculated.totalCgst.toFixed(2)), // Cumulative CGST from items
      sgst: parseFloat(calculated.totalSgst.toFixed(2)), // Cumulative SGST from items
      igst: parseFloat(calculated.totalIgst.toFixed(2)), // Cumulative IGST from items
      cessValue: parseFloat(calculated.totalCess.toFixed(2)), // Cumulative CESS from items
      total: parseFloat(calculated.total.toFixed(2)),
      publicToken,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create credit note items
  const createdCreditNoteItems = await CreditNoteItem.bulkCreate(
    calculated.creditNoteItemsData.map(item => ({
      ...item,
      creditNoteId: creditNote.id,
    })),
    { transaction: t }
  );

  // sending email to the client about credit note created (non-blocking)
  try {
    const client = await Clients.findOne({
      where: { id: creditNote?.clientId }
    })
    
    if(client && client.email){
      const invoice = await Invoice.findByPk(body.invoiceId);
      
      try {
        const baseUrl = process.env.ADMIN_URL || process.env.BASE_URL || process.env.APP_BASE_URL || '';
        const normalizedBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
        const creditNoteLink = normalizedBase ? `${normalizedBase}/public-credit-note/${creditNote.publicToken}` : `/public-credit-note/${creditNote.publicToken}`;

        await sendEmail({
          from: company?.email || "" as any,
          to: client.email,
          subject: `Credit Note ${creditNote.creditNo}`,
          htmlFile: "credit-note",
          replacements: {
            clientName: client.clientfirstName || client.businessName || "Customer",
            creditNoteNo: creditNote.creditNo,
            invoiceNo: invoice ? invoice.invoiceNo : "",
            creditAmount: creditNote.total,
            creditNoteLink,
            currentYear: new Date().getFullYear(),
          },
          html: null,
          text: "",
          attachments: null,
          cc: null,
          replyTo: null,
        });
      } catch (emailError) {
        console.error("Failed to send credit note email:", emailError);
        // Don't throw error - email is non-blocking, credit note is already created
      }
    }
  } catch (error) {
    console.error("Error preparing email for credit note:", error);
    // Don't throw error - email is optional, credit note creation should succeed
  }

  return {
    creditNote,
    creditNoteItems: createdCreditNoteItems,
  };
};

// Get credit note by ID with all related data
export const getCreditNoteById = async (id: string, companyId: string) => {
  return await CreditNote.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: Company,
        as: "company"
      },
      {
        model: Clients,
        as: "client"
      },
      {
        model: CreditNoteItem,
        as: "creditNoteItems",
      },
    ],
  });
};

// Get all credit notes for a company
export const getCreditNotesByCompany = async (companyId: string) => {
  return await CreditNote.findAll({
    where: { companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
        attributes: ["id", "clientfirstName", "clientlastName", "businessName", "email"]
      },
      {
        model: Invoice,
        as: "invoice",
        attributes: ["id", "invoiceNo", "invoiceDate"]
      }
    ],
    order: [["creditDate", "DESC"]],
  });
};

// Get credit notes by client
export const getCreditNotesByClient = async (clientId: string, companyId: string) => {
  return await CreditNote.findAll({
    where: { clientId, companyId, isDeleted: false },
    order: [["creditDate", "DESC"]],
  });
};

// Get credit notes by invoice
export const getCreditNotesByInvoice = async (invoiceId: string, companyId: string) => {
  return await CreditNote.findAll({
    where: { invoiceId, companyId, isDeleted: false },
    order: [["creditDate", "DESC"]],
  });
};

// Update credit note with full recalculation
export const updateCreditNote = async (
  id: string,
  companyId: string,
  body: CreateCreditNoteInput,
  t: Transaction
) => {
  // First, verify the credit note exists
  const existingCreditNote = await CreditNote.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
  });

  if (!existingCreditNote) {
    return [0]; // Return same format as Sequelize update
  }

  const creditDate = body.creditDate || existingCreditNote.creditDate;
  const invoiceDate = body.invoiceDate || existingCreditNote.invoiceDate;
  const invoiceId = body.invoiceId || existingCreditNote.invoiceId;

  // Fetch all items from database to get their details
  const itemIds = body.items.map(item => item.itemId);
  const itemsFromDb = await Item.findAll({
    where: { id: itemIds, companyId: body.companyId, isActive: true, isDeleted: false }
  });
  const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

  if (itemsFromDb.length !== itemIds.length) {
    throw new Error("One or more items not found or inactive");
  }

  // Fetch company details to get state for tax calculation
  const company = await Company.findByPk(body.companyId);
  if (!company) {
    throw new Error("Company not found");
  }
  const companyState = company.state ?? "";

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  // Credit notes always apply tax (same as tax invoice)
  const isTaxApplicable = true;
  // Use shared calculation logic
  const calculated = calculateCreditNoteTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    isTaxApplicable,
    body.placeOfSupply,
    companyState,
    body.shippingAmount,
    body.shippingTax,
  );

  // Update the credit note
  await CreditNote.update(
    {
      clientId: body.clientId,
      taxSelectionOn: body.taxSelectionOn,
      placeOfSupply: body.placeOfSupply,
      creditNo: body.creditNo,
      invoiceId,
      invoiceDate,
      creditDate,
      reason: body.reason,
      unitId: body.unitId || null,
      totalQuantity: body.unitQuantity || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountToAll: body.addDiscountToAll,
      showCess: body.showCess,
      notes: body.notes || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      taxable: parseFloat(calculated.taxable.toFixed(2)),
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

  // Delete existing credit note items
  await CreditNoteItem.destroy({
    where: { creditNoteId: id },
    transaction: t,
  });

  // Create new credit note items
  await CreditNoteItem.bulkCreate(
    calculated.creditNoteItemsData.map(item => ({
      ...item,
      creditNoteId: id,
    })),
    { transaction: t }
  );

  return [1]; // Return same format as Sequelize update - 1 row affected
};

// Soft delete credit note
export const deleteCreditNote = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Fetch credit note with lock
  const creditNote = await CreditNote.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!creditNote) {
    throw new Error("Credit Note not found");
  }

  // Soft delete credit note items
  await CreditNoteItem.update(
    { isActive: false, isDeleted: true },
    {
      where: { creditNoteId: id },
      transaction: t,
    }
  );

  // Delete ledger entry for this credit note
  await deleteLedgerByReference("credit_note", id, t);

  // Soft delete credit note
  await CreditNote.update(
    {
      isActive: false,
      isDeleted: true,
    },
    {
      where: { id, companyId },
      transaction: t,
    }
  );
  return {
    success: true,
    message: "Credit Note deleted successfully",
    creditNoteId: id,
  };
};

// Bulk delete credit notes
export const bulkDeleteCreditNotes = async (
  ids: string[],
  companyId: string,
  t: Transaction
) => {
  const results = {
    successful: [] as string[],
    failed: [] as { id: string; reason: string }[],
  };

  for (const id of ids) {
    try {
      // Fetch credit note with lock
      const creditNote = await CreditNote.findOne({
        where: { id, companyId, isDeleted: false },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!creditNote) {
        results.failed.push({ id, reason: "Credit Note not found" });
        continue;
      }

      // Soft delete credit note items
      await CreditNoteItem.update(
        { isActive: false, isDeleted: true },
        {
          where: { creditNoteId: id },
          transaction: t,
        }
      );

      // Soft delete credit note
      await CreditNote.update(
        {
          isActive: false,
          isDeleted: true,
        },
        {
          where: { id, companyId },
          transaction: t,
        }
      );

      results.successful.push(id);
    } catch (error: any) {
      results.failed.push({ id, reason: error.message || "Unknown error" });
    }
  }

  return results;
};

// Search credit note with filters
export interface SearchCreditNoteFilters {
  companyId: string;
  clientName?: string;
  creditNo?: string;
  status?: string;
  city?: string;
  itemName?: string;
  amountFrom?: number;
  amountTo?: number;
  creditDateFrom?: Date;
  creditDateTo?: Date;
}

export const searchCreditNote = async (filters: SearchCreditNoteFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by invoice number
  if (filters.creditNo) {
    whereConditions.invoiceNo = {
      [Op.like]: `%${filters.creditNo}%`,
    };
  }

  // Filter by status
  if (filters.status) {
    whereConditions.status = filters.status;
  }

  // Filter by issue date range
  if (filters.creditDateFrom || filters.creditDateTo) {
    const dateFilter: any = {};
    if (filters.creditDateFrom) dateFilter[Op.gte] = filters.creditDateFrom;
    if (filters.creditDateTo) dateFilter[Op.lte] = filters.creditDateTo;
    whereConditions.creditDate = dateFilter;
  }

  // Filter by due date range
  if (filters.amountFrom || filters.amountTo) {
    const amountFilter: any = {};
    if (filters.amountFrom) amountFilter[Op.gte] = filters.amountFrom;
    if (filters.amountTo) amountFilter[Op.lte] = filters.amountTo;
    whereConditions.total = amountFilter;
  }

  // Build include array for associations
  const includeArray: any[] = [
    {
      model: CreditNoteItem,
      as: "creditNoteItems",
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
      model: CreditNoteItem,
      as: "creditNoteItems",
      where: {
        itemName: {
          [Op.like]: `%${filters.itemName}%`,
        },
      },
      required: true,
    };
  }

  return await CreditNote.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["creditDate", "DESC"]],
    subQuery: false,
  });
};

// Get credit note by public token (public preview)
export const getCreditNoteByPublicToken = async (publicToken: string) => {
  return await CreditNote.findOne({
    where: { publicToken, isDeleted: false },
    include: [
      { model: Company, as: "company" },
      { model: Clients, as: "client" },
      { model: CreditNoteItem, as: "creditNoteItems" }
    ],
  });
};