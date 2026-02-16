import { Op, Transaction } from "sequelize";
import { DebitNote } from "./debit-note-model";
import { DebitNoteItem } from "./debit-note-item-model";
import { Item } from "../item/item-model";
import { Company } from "../../company/company-model";
import { Clients } from "../../agency/clients/clients-model";
import { Vendor } from "../vendor/vendor-model";
import { PurchaseBill } from "../purchase-Bill/purchase-bill-model";
import { Invoice } from "../invoice/invoice-model";
import { addDebitNoteLedger, deleteLedgerByReference } from "../client-ledger/client-ledger-handler";

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

interface DebitCalculationResult {
  subTotal: number;
  finalDiscount: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  total: number;
  debitNoteItemsData: any[];
}

interface CreateDebitNoteInput {
  companyId: string;
  clientId?: string;
  vendorId?: string;
  placeOfSupply: string;
  creditNo: string;
  invoiceId?: string;
  purchaseBillId?: string;
  billInvoiceNo?: string;
  invoiceDate: Date;
  debitDate?: Date;
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

// Shared calculation logic for debit note totals
const calculateDebitNoteTotals = (
  items: any[],
  itemMap: Map<string, any>,
  addDiscountToAll: number | undefined,
  showCess: boolean,
  isTaxInvoice: boolean,
  placeOfSupply: string,
  companyState: string,
  shippingAmount: number | undefined,
  shippingTax: number | undefined
): DebitCalculationResult => {
  let subTotal = 0;
  let finalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const debitNoteItemsData = items.map((inputItem) => {
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
    subTotal: parseFloat(subTotal.toFixed(2)),
    finalDiscount: parseFloat(finalDiscount.toFixed(2)),
    taxable: parseFloat(totalTaxable.toFixed(2)),
    totalCgst: parseFloat(totalCgst.toFixed(2)),
    totalSgst: parseFloat(totalSgst.toFixed(2)),
    totalIgst: parseFloat(totalIgst.toFixed(2)),
    totalCess: parseFloat(totalCess.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    debitNoteItemsData,
  };
};

// Create debit note with all related data
export const createDebitNote = async (body: CreateDebitNoteInput, t: Transaction) => {
  const debitDate = body.debitDate || new Date();
  const invoiceDate = body.invoiceDate || new Date();

  // Validate that either clientId or vendorId is provided, not both
  if (!body.clientId && !body.vendorId) {
    throw new Error("Either clientId (for invoice-based debit note) or vendorId (for purchase bill-based debit note) must be provided");
  }
  if (body.clientId && body.vendorId) {
    throw new Error("Cannot provide both clientId and vendorId. Debit note must be for either client or vendor");
  }

  // Validate corresponding invoice or purchase bill
  if (body.clientId && !body.invoiceId) {
    throw new Error("invoiceId is required for client-based debit note");
  }
  if (body.vendorId && !body.purchaseBillId) {
    throw new Error("purchaseBillId is required for vendor-based debit note");
  }

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

  // Debit notes always apply tax (same as tax invoice)
  const isTaxApplicable = true;
  
  const calculated = calculateDebitNoteTotals(
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

  console.log('Debit Note Calculation:', {
    subTotal: calculated.subTotal,
    totalCgst: calculated.totalCgst,
    totalSgst: calculated.totalSgst,
    totalIgst: calculated.totalIgst,
    totalCess: calculated.totalCess,
    finalDiscount: calculated.finalDiscount,
    total: calculated.total,
  });

  // Create debit note
  const debitNote = await DebitNote.create(
    {
      companyId: body.companyId,
      clientId: (body.clientId ?? null) as any,
      vendorId: (body.vendorId ?? null) as any,
      placeOfSupply: body.placeOfSupply,
      debitNo: body.creditNo,
      invoiceId: (body.invoiceId ?? null) as any,
      purchaseBillId: (body.purchaseBillId ?? null) as any,
      billInvoiceNo: (body.billInvoiceNo ?? null) as any,
      invoiceDate,
      debitDate,
      reason: body.reason,
      unitId: body.unitId || null,
      unitQuantity: body.unitQuantity || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountToAll: body.addDiscountToAll,
      showCess: body.showCess,
      notes: body.notes || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)),
      taxable: calculated.taxable,
      cgst: parseFloat(calculated.totalCgst.toFixed(2)),
      sgst: parseFloat(calculated.totalSgst.toFixed(2)),
      igst: parseFloat(calculated.totalIgst.toFixed(2)),
      cessValue: parseFloat(calculated.totalCess.toFixed(2)),
      total: parseFloat(calculated.total.toFixed(2)),
      status: 'Active',
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create debit note items
  const createdDebitNoteItems = await DebitNoteItem.bulkCreate(
    calculated.debitNoteItemsData.map(item => ({
      ...item,
      debitNoteId: debitNote.id,
    })),
    { transaction: t }
  );

  // Add ledger entry for client-based debit note only
  if (debitNote.clientId) {
    await addDebitNoteLedger(
      debitNote.clientId,
      debitNote.companyId,
      debitNote.id,
      debitNote.debitNo,
      debitNote.debitDate,
      debitNote.total,
      t
    );
  }

  return {
    debitNote,
    debitNoteItems: createdDebitNoteItems,
  };
};

// Get debit note by ID with all related data
export const getDebitNoteById = async (id: string, companyId: string) => {
  return await DebitNote.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: DebitNoteItem,
        as: "debitNoteItems",
      },
      {
        model: Clients,
        as: "client",
        attributes: ["id", "clientfirstName", "clientlastName", "businessName", "email"],
        required: false
      },
      {
        model: Vendor,
        as: "vendor",
        attributes: ["id", "name", "companyName", "email"],
        required: false
      },
      {
        model: Invoice,
        as: "invoice",
        attributes: ["id", "invoiceNo", "invoiceDate"],
        required: false
      },
      {
        model: PurchaseBill,
        as: "purchaseBill",
        attributes: ["id", "purchaseBillNo", "purchaseBillDate"],
        required: false
      }
    ],
  });
};

// Get all debit notes for a company
export const getDebitNotesByCompany = async (companyId: string) => {
  return await DebitNote.findAll({
    where: { companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
        attributes: ["id", "clientfirstName", "clientlastName", "businessName", "email"],
        required: false
      },
      {
        model: Vendor,
        as: "vendor",
        attributes: ["id", "name", "companyName", "email"],
        required: false
      },
      {
        model: Invoice,
        as: "invoice",
        attributes: ["id", "invoiceNo", "invoiceDate"],
        required: false
      },
      {
        model: PurchaseBill,
        as: "purchaseBill",
        attributes: ["id", "purchaseBillNo", "purchaseBillDate"],
        required: false
      }
    ],
    order: [["debitDate", "DESC"]],
  });
};

// Get debit notes by client
export const getDebitNotesByClient = async (clientId: string, companyId: string) => {
  return await DebitNote.findAll({
    where: { clientId, companyId, isDeleted: false },
    order: [["debitDate", "DESC"]],
  });
};

// Get debit notes by vendor
export const getDebitNotesByVendor = async (vendorId: string, companyId: string) => {
  return await DebitNote.findAll({
    where: { vendorId, companyId, isDeleted: false },
    order: [["debitDate", "DESC"]],
  });
};

// Get debit notes by invoice
export const getDebitNotesByInvoice = async (invoiceId: string, companyId: string) => {
  return await DebitNote.findAll({
    where: { invoiceId, companyId, isDeleted: false },
    order: [["debitDate", "DESC"]],
  });
};

// Get debit notes by purchase bill
export const getDebitNotesByPurchaseBill = async (purchaseBillId: string, companyId: string) => {
  return await DebitNote.findAll({
    where: { purchaseBillId, companyId, isDeleted: false },
    order: [["debitDate", "DESC"]],
  });
};

// Update debit note with full recalculation
export const updateDebitNote = async (
  id: string,
  companyId: string,
  body: CreateDebitNoteInput,
  t: Transaction
) => {
  // First, verify the debit note exists
  const existingDebitNote = await DebitNote.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
  });

  if (!existingDebitNote) {
    return [0]; // Return same format as Sequelize update
  }

  // Validate that either clientId or vendorId is provided, not both
  const clientId = body.clientId || existingDebitNote.clientId;
  const vendorId = body.vendorId || existingDebitNote.vendorId;

  if (!clientId && !vendorId) {
    throw new Error("Either clientId or vendorId must be provided");
  }
  if (clientId && vendorId) {
    throw new Error("Cannot provide both clientId and vendorId");
  }

  const debitDate = body.debitDate || existingDebitNote.debitDate;
  const invoiceDate = body.invoiceDate || existingDebitNote.invoiceDate;
  const invoiceId = body.invoiceId || existingDebitNote.invoiceId;
  const purchaseBillId = body.purchaseBillId || existingDebitNote.purchaseBillId;

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

  // Debit notes always apply tax
  const isTaxApplicable = true;
  
  // Use shared calculation logic
  const calculated = calculateDebitNoteTotals(
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

  // Update the debit note
  await DebitNote.update(
    {
      clientId: (clientId ?? null) as any,
      vendorId: (vendorId ?? null) as any,
      placeOfSupply: body.placeOfSupply,
      debitNo: body.creditNo,
      invoiceId: (invoiceId ?? null) as any,
      purchaseBillId: (purchaseBillId ?? null) as any,
      billInvoiceNo: (body.billInvoiceNo ?? null) as any,
      invoiceDate,
      debitDate,
      reason: body.reason,
      unitId: body.unitId || null,
      unitQuantity: body.unitQuantity || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountToAll: body.addDiscountToAll,
      showCess: body.showCess,
      notes: body.notes || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      taxable: parseFloat(calculated.taxable.toFixed(2)),
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)),
      cgst: parseFloat(calculated.totalCgst.toFixed(2)),
      sgst: parseFloat(calculated.totalSgst.toFixed(2)),
      igst: parseFloat(calculated.totalIgst.toFixed(2)),
      cessValue: parseFloat(calculated.totalCess.toFixed(2)),
      total: parseFloat(calculated.total.toFixed(2)),
    },
    {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    }
  );

  // Delete existing debit note items
  await DebitNoteItem.destroy({
    where: { debitNoteId: id },
    transaction: t,
  });

  // Create new debit note items
  await DebitNoteItem.bulkCreate(
    calculated.debitNoteItemsData.map(item => ({
      ...item,
      debitNoteId: id,
    })),
    { transaction: t }
  );

  return [1]; // Return same format as Sequelize update - 1 row affected
};

// Soft delete debit note
export const deleteDebitNote = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Fetch debit note with lock
  const debitNote = await DebitNote.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!debitNote) {
    throw new Error("Debit Note not found");
  }

  // Soft delete debit note items
  await DebitNoteItem.update(
    { isActive: false, isDeleted: true },
    {
      where: { debitNoteId: id },
      transaction: t,
    }
  );

  // Delete ledger entry for client-based debit note only
  if (debitNote.clientId) {
    await deleteLedgerByReference("debit_note", id, t);
  }

  // Soft delete debit note
  await DebitNote.update(
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
    message: "Debit Note deleted successfully",
    creditNoteId: id,
  };
};

// Bulk delete debit notes
export const bulkDeleteDebitNotes = async (
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
      // Fetch debit note with lock
      const debitNote = await DebitNote.findOne({
        where: { id, companyId, isDeleted: false },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!debitNote) {
        results.failed.push({ id, reason: "Debit Note not found" });
        continue;
      }

      // Soft delete debit note items
      await DebitNoteItem.update(
        { isActive: false, isDeleted: true },
        {
          where: { debitNoteId: id },
          transaction: t,
        }
      );

      // Soft delete debit note
      await DebitNote.update(
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

// Search debit note with filters
export interface SearchDebitNoteFilters {
  companyId: string;
  clientName?: string;
  vendorName?: string;
  debitNo?: string;
  status?: string;
  city?: string;
  itemName?: string;
  amountFrom?: number;
  amountTo?: number;
  debitDateFrom?: Date;
  debitDateTo?: Date;
}

export const searchDebitNote = async (filters: SearchDebitNoteFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by debit note number
  if (filters.debitNo) {
    whereConditions.debitNo = {
      [Op.like]: `%${filters.debitNo}%`,
    };
  }

  // Filter by status
  if (filters.status) {
    whereConditions.status = filters.status;
  }

  // Filter by debit date range
  if (filters.debitDateFrom || filters.debitDateTo) {
    const dateFilter: any = {};
    if (filters.debitDateFrom) dateFilter[Op.gte] = filters.debitDateFrom;
    if (filters.debitDateTo) dateFilter[Op.lte] = filters.debitDateTo;
    whereConditions.debitDate = dateFilter;
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
      model: DebitNoteItem,
      as: "debitNoteItems",
    },
  ];

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

  // Filter by city (from client or vendor)
  if (filters.city) {
    // This will need to check both client and vendor cities
    includeArray.forEach(inc => {
      if ((inc.model === Clients || inc.model === Vendor) && !inc.where) {
        inc.where = {
          city: { [Op.like]: `%${filters.city}%` },
        };
      } else if ((inc.model === Clients || inc.model === Vendor) && inc.where) {
        inc.where.city = { [Op.like]: `%${filters.city}%` };
      }
    });
  }

  // Filter by item name
  if (filters.itemName) {
    includeArray[0] = {
      model: DebitNoteItem,
      as: "debitNoteItems",
      where: {
        itemName: {
          [Op.like]: `%${filters.itemName}%`,
        },
      },
      required: true,
    };
  }

  return await DebitNote.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["debitDate", "DESC"]],
    subQuery: false,
  });
};