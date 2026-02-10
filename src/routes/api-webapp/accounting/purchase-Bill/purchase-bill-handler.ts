import { Op, Transaction } from "sequelize";
import { PurchaseBill } from "./purchase-bill-model";
import { PurchaseBillItem } from "./purcharse-bill-item-model";
import { Item } from "../item/item-model";
import { PurchaseBillTdsTcs } from "./tds-tcs/pb-tds-tcs-model";
import { Company } from "../../company/company-model";
import { Vendor } from "../vendor/vendor-model";
import { Payments, PaymentMethod } from "../payments/payments-model";
import { PaymentsDocuments } from "../payments/payments-documents-model";


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
  
  // Also check if place is just the state code
  const justCodeMatch = p.match(/^([A-Za-z]{2})(\s|$)/i);
  if (justCodeMatch) {
    const code = justCodeMatch[1].toUpperCase();
    const mapped = stateCodeMap[code];
    if (mapped && cLower.includes(mapped)) return true;
  }
  
  // Try to extract any 2-letter sequence from place and match against codes
  for (const [code, stateName] of Object.entries(stateCodeMap)) {
    if (pLower.includes(code.toLowerCase()) || pLower.startsWith(code.toLowerCase())) {
      if (cLower.includes(stateName)) return true;
    }
  }
  
  // Also try reverse: check if company state code matches place state name
  for (const [code, stateName] of Object.entries(stateCodeMap)) {
    if (cLower.includes(code.toLowerCase()) && pLower.includes(stateName)) return true;
    if (cLower === code.toLowerCase() && pLower.includes(stateName)) return true;
  }
  
  return false;
};

interface PurchaseBillCalculationResult {
  subTotal: number;
  finalDiscount: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  total: number;
  purchaseBillItemsData: any[];
}

interface CreatePurchaseBillInput {
  companyId: string;
  vendorId: string;
  taxSelectionOn?: string;
  placeOfSupply: string;
  invoiceNo: string;
  purchaseBillDate: Date;
  status: 'Open';
  poNo: string;
  poDate: Date;
  dueDate: Date;
  purchaseBillNo?: string;
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
  addDiscountToAll?: number; // Discount distributed to all items
  showCess: boolean;
  reverseCharge: boolean;
  tdsTcsEntries?: Array<{
    taxPercentage: number;
    type: string;
    taxName: string;
    applicableOn: string; // "taxable" or "total"
  }>;
  termsConditions?: string;
  privateNotes?: string;
}

// Shared calculation logic for purchase bill totals
const calculatePurchaseBillTotals = (
  items: any[],
  itemMap: Map<string, any>,
  addDiscountToAll: number | undefined,
  showCess: boolean,
  placeOfSupply: string,
  companyState: string,
  shippingAmount: number | undefined,
  shippingTax: number | undefined,
  reverseCharge: boolean | undefined,
  tdsTcsEntries: any[] | undefined
): PurchaseBillCalculationResult => {
  let subTotal = 0;
  let finalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const purchaseBillItemsData = items.map((inputItem) => {
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

    const isInterstate = !isSameState(placeOfSupply, companyState);
    console.log('Tax Calculation Debug:', {
      placeOfSupply,
      companyState,
      isSameState: isSameState(placeOfSupply, companyState),
      isInterstate,
      itemTax,
      amountForTax
    });

    const taxTotals = applyTaxSplit(amountForTax, itemTax, isInterstate, {
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
    });
    totalCgst = taxTotals.cgst;
    totalSgst = taxTotals.sgst;
    totalIgst = taxTotals.igst;
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

  let totalBeforeTdsTcs;
  if(reverseCharge){
   totalBeforeTdsTcs = subTotal  - finalDiscount + (shippingAmount || 0);
  } else {
    totalBeforeTdsTcs = subTotal + totalCgst + totalSgst + totalIgst + totalCess - finalDiscount + (shippingAmount || 0);
  }
  

  // Calculate TDS and TCS amounts
  let totalTds = 0;
  let totalTcs = 0;
  const taxableBase = subTotal - finalDiscount;
  // Purchase bill total BEFORE TDS/TCS
  const totalBase = reverseCharge
    ? taxableBase
        + (shippingAmount || 0)
    : taxableBase
        + totalCgst
        + totalSgst
        + totalIgst
        + totalCess
        + (shippingAmount || 0);

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
    purchaseBillItemsData,
  };
};

// Create purchase bill with all related data
export const createPurchaseBill = async (body: CreatePurchaseBillInput, t: Transaction) => {
  // Validate required fields
  if (!body.poDate) {
    throw new Error("poDate is required");
  }
  if (!body.dueDate) {
    throw new Error("dueDate is required");
  }

  const purchaseBillDate = body.purchaseBillDate || new Date();
  const dueDate = body.dueDate;

  // Generate purchaseBillNo only if not provided
  const purchaseBillNo = body.purchaseBillNo || `PB-${Date.now()}`;

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
  const companyState: string = company.state ?? "";

  // Fetch vendor details to get state for tax calculation
  const vendor = await Vendor.findByPk(body.vendorId);
  if (!vendor) {
    throw new Error("Vendor not found");
  }

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  // Use shared calculation logic
  const calculated = calculatePurchaseBillTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    body.placeOfSupply,
    companyState,
    body.shippingAmount,
    body.shippingTax,
    body.reverseCharge,
    body.tdsTcsEntries
  );

  // Create purchase bill
  const purchaseBill = await PurchaseBill.create(
    {
      companyId: body.companyId,
      vendorId: body.vendorId,
      purchaseBillNo: purchaseBillNo,
      placeOfSupply: body.placeOfSupply,
      invoiceNo: body.invoiceNo,
      purchaseBillDate,
      status: 'Open',
      poNo: body.poNo,
      poDate: body.poDate,
      dueDate,
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)),
      unitId: body.unitId || null,
      totalQuantity: body.unitQuantity || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountToAll: body.addDiscountToAll,
      showCess: body.showCess,
      cessValue: parseFloat(calculated.totalCess.toFixed(2)),
      reverseCharge: body.reverseCharge,
      termsConditions: body.termsConditions || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      taxable: parseFloat(calculated.taxable.toFixed(2)),
      cgst: parseFloat(calculated.totalCgst.toFixed(2)),
      sgst: parseFloat(calculated.totalSgst.toFixed(2)),
      igst: parseFloat(calculated.totalIgst.toFixed(2)),
      total: parseFloat(calculated.total.toFixed(2)),
      balance: parseFloat(calculated.total.toFixed(2)),
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create purchase bill items
  const createdPurchaseBillItems = await PurchaseBillItem.bulkCreate(
    calculated.purchaseBillItemsData.map(item => ({
      ...item,
      purchaseBillId: purchaseBill.id,
    })),
    { transaction: t }
  );

  const taxableBase = calculated.subTotal - calculated.finalDiscount;

  const totalBase = body.reverseCharge
    ? taxableBase
        + (body.shippingAmount || 0)
    : taxableBase
        + calculated.totalCgst
        + calculated.totalSgst
        + calculated.totalIgst
        + calculated.totalCess
        + (body.shippingAmount || 0);

  // Create TDS/TCS entries if provided
  let createdTdsTcs: any[] = [];
  if (body.tdsTcsEntries && body.tdsTcsEntries.length > 0) {
    
    createdTdsTcs = await PurchaseBillTdsTcs.bulkCreate(
      body.tdsTcsEntries.map(entry => {
        const baseAmount = entry.applicableOn === "total" ? totalBase : taxableBase;
        const taxAmount = baseAmount * (entry.taxPercentage / 100);
        
        return {
          companyId: body.companyId,
          purchaseBillId: purchaseBill.id,
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

  return {
    purchaseBill,
    purchaseBillItems: createdPurchaseBillItems,
    tdsTcsEntries: createdTdsTcs,
  };
};

// Get purchase bill by ID with all related data
export const getPurchaseBillById = async (id: string, companyId: string) => {
  return await PurchaseBill.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: Vendor,
        as: "vendor",
      },
      {
        model: Company,
        as: "company",
      },
      {
        model: PurchaseBillItem,
        as: "purchaseBillItems",
      },
      {
        model: PurchaseBillTdsTcs,
        as: "tdsTcsEntries",
      },
    ],
  });
};

// Get all purchase bills for a company
export const getPurchaseBillsByCompany = async (companyId: string) => {
  return await PurchaseBill.findAll({
    where: { companyId, isDeleted: false },
    include: [
      {
        model: Vendor,
        as: "vendor",
      },
    ],
    order: [["purchaseBillDate", "DESC"]],
  });
};

// Get purchase bills by vendor
export const getPurchaseBillsByVendor = async (vendorId: string, companyId: string) => {
  return await PurchaseBill.findAll({
    where: { vendorId, companyId, isDeleted: false },
    order: [["purchaseBillDate", "DESC"]],
  });
};

// Update purchase bill with full recalculation
export const updatePurchaseBill = async (
  id: string,
  companyId: string,
  body: Partial<CreatePurchaseBillInput>,
  t: Transaction
) => {
  // Find existing purchase bill
  const existingPurchaseBill = await PurchaseBill.findOne({
    where: { id, companyId, isDeleted: false },
  });

  if (!existingPurchaseBill) {
    throw new Error("Purchase bill not found");
  }

  // Check if items or numerical values are being updated - recalculate if so
  const needsRecalculation = body.items || body.shippingAmount !== undefined || 
    body.shippingTax !== undefined || body.addDiscountToAll !== undefined || 
    body.showCess !== undefined || body.tdsTcsEntries;

  // If items or numerical values are being updated, perform full recalculation
  if (needsRecalculation) {// Merge body with existing purchase bill data
    const mergedData = {
      ...existingPurchaseBill.toJSON(),
      ...body,
      items: body.items || (existingPurchaseBill as any).purchaseBillItems?.map((item: any) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        discount: item.discount,
      })) || [],
    };
    
    // Fetch all items from database
    const itemIds = mergedData.items.map((item: any) => item.itemId);
    const itemsFromDb = await Item.findAll({
      where: { id: itemIds, companyId, isActive: true, isDeleted: false }
    });
    const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

    if (itemsFromDb.length !== itemIds.length) {
      throw new Error("One or more items not found or inactive");
    }

    // Fetch company details
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new Error("Company not found");
    }
    const companyState = company.state ?? "";

    // Fetch vendor details (use existing vendorId if not in body)
    const vendorId = body.vendorId || existingPurchaseBill.vendorId;
    const vendor = await Vendor.findByPk(vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Validate unitId
    const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
    if (itemsWithoutUnit.length > 0) {
      throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
    }

    // Use shared calculation logic
    const calculated = calculatePurchaseBillTotals(
      mergedData.items,
      itemMap,
      mergedData.addDiscountToAll !== null ? mergedData.addDiscountToAll : undefined,
      mergedData.showCess,
      mergedData.placeOfSupply,
      companyState,
      mergedData.shippingAmount !== null ? mergedData.shippingAmount : undefined,
      mergedData.shippingTax !== null ? mergedData.shippingTax : undefined,
      mergedData.reverseCharge,
      mergedData.tdsTcsEntries
    );

    // Check payment status before modification
    if (["Closed", "Partially Paid"].includes((existingPurchaseBill as any).status)) {
      throw new Error("Purchase bill with payments cannot be modified");
    }

    // Calculate paid amount from PaymentsDocuments
    const paymentDocs = await PaymentsDocuments.findAll({
      where: { documentId: id, documentType: "PurchaseBill" },
      transaction: t,
    });
    const paidAmount = paymentDocs.reduce((sum, doc) => sum + Number(doc.paymentValue), 0);

    const newBalance = calculated.total - paidAmount;
    if (newBalance < 0) {
      throw new Error("Purchase Bill total cannot be less than paid amount");
    }

    // Use provided dueDate or keep existing
    const dueDate = body.dueDate || existingPurchaseBill.dueDate;

    // Update purchase bill
    await PurchaseBill.update(
      {
        ...body,
        subTotal: parseFloat(calculated.subTotal.toFixed(2)),
        taxable: parseFloat(calculated.taxable.toFixed(2)),
        cgst: parseFloat(calculated.totalCgst.toFixed(2)),
        sgst: parseFloat(calculated.totalSgst.toFixed(2)),
        igst: parseFloat(calculated.totalIgst.toFixed(2)),
        total: parseFloat(calculated.total.toFixed(2)),
        balance: parseFloat(newBalance.toFixed(2)),
      },
      { where: { id, companyId }, transaction: t }
    );

    // Delete old items and create new ones
    await PurchaseBillItem.destroy({
      where: { purchaseBillId: id },
      transaction: t,
    });

    await PurchaseBillItem.bulkCreate(
      calculated.purchaseBillItemsData.map(item => ({
        ...item,
        purchaseBillId: id,
      })),
      { transaction: t }
    );

    // Update TDS/TCS entries
    if (mergedData.tdsTcsEntries) {
      await PurchaseBillTdsTcs.destroy({
        where: { purchaseBillId: id },
        transaction: t,
      });

      if (mergedData.tdsTcsEntries.length > 0) {
        // Calculate base amounts for TDS/TCS
        const taxableBase = calculated.subTotal - calculated.finalDiscount;

        const totalBase = mergedData.reverseCharge
          ? taxableBase
              + (mergedData.shippingAmount || 0)
          : taxableBase
              + calculated.totalCgst
              + calculated.totalSgst
              + calculated.totalIgst
              + calculated.totalCess
              + (mergedData.shippingAmount || 0);
        
        await PurchaseBillTdsTcs.bulkCreate(
          mergedData.tdsTcsEntries.map(entry => {
            const baseAmount = entry.applicableOn === "total" ? totalBase : taxableBase;
            const taxAmount = baseAmount * (entry.taxPercentage / 100);
            
            return {
              companyId,
              purchaseBillId: id,
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
    }

    return [1];
  } else {
    await PurchaseBill.update(
      body,
      { 
        where: { id, companyId, isDeleted: false }, 
        transaction: t 
      }
    );
    return await getPurchaseBillById(id, companyId);
  }
};

// Soft delete purchase bill
export const deletePurchaseBill = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Fetch purchase bill
  const purchaseBill = await PurchaseBill.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!purchaseBill) {
    throw new Error("Purchase bill not found");
  }

  // Block delete if bill is not open
  if (purchaseBill.status !== "Open") {
    throw new Error(
      "Only OPEN purchase bills can be deleted"
    );
  }

  // Check for linked payments
  const paymentCount = await PaymentsDocuments.count({
    where: {
      documentId: id,
      documentType: "PurchaseBill",
    },
    transaction: t,
  });

  if (paymentCount > 0) {
    throw new Error(
      "Purchase bill has linked payments and cannot be deleted"
    );
  }

  // Soft delete TDS/TCS entries
  await PurchaseBillTdsTcs.update(
    { isActive: false, isDeleted: true },
    {
      where: { purchaseBillId: id },
      transaction: t,
    }
  );

  // Soft delete purchase bill items
  await PurchaseBillItem.update(
    { isActive: false, isDeleted: true },
    {
      where: { purchaseBillId: id },
      transaction: t,
    }
  );

  // Safe soft delete purchase bill
  await PurchaseBill.update(
    { isActive: false, isDeleted: true },
    {
      where: { id, companyId },
      transaction: t,
    }
  );

  return { success: true };
};


// Search purchase bill with filters
export interface SearchPurchaseBillFilters {
  companyId: string;
  vendorName?: string;
  purchaseBillNo?: string;
  status?: string;
  city?: string;
  itemName?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

export const searchPurchaseBill = async (filters: SearchPurchaseBillFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by purchase bill number
  if (filters.purchaseBillNo) {
    whereConditions.purchaseBillNo = {
      [Op.like]: `%${filters.purchaseBillNo}%`,
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
    whereConditions.purchaseBillDate = dateFilter;
  }

  // Filter by due date range
  if (filters.dueDateFrom || filters.dueDateTo) {
    const dateFilter: any = {};
    if (filters.dueDateFrom) dateFilter[Op.gte] = filters.dueDateFrom;
    if (filters.dueDateTo) dateFilter[Op.lte] = filters.dueDateTo;
    whereConditions.dueDate = dateFilter;
  }

  // Build include array for associations
  const includeArray: any[] = [
    {
      model: PurchaseBillItem,
      as: "purchaseBillItems",
    },
    {
      model: PurchaseBillTdsTcs,
      as: "tdsTcsEntries",
    },
  ];

  // Filter by vendor name
  const vendorWhere: any = {};
  if (filters.vendorName) {
    vendorWhere[Op.or] = [
      { vendorfirstName: { [Op.like]: `%${filters.vendorName}%` } },
      { vendorLastName: { [Op.like]: `%${filters.vendorName}%` } },
      { businessName: { [Op.like]: `%${filters.vendorName}%` } },
    ];
  }

  // Filter by city (from client)
  if (filters.city) {
    vendorWhere.city = {
      [Op.like]: `%${filters.city}%`,
    };
  }

  // Add client to include if there are client filters
  if (Object.keys(vendorWhere).length > 0) {
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

  // Filter by item name
  if (filters.itemName) {
    includeArray[0] = {
      model: PurchaseBillItem,
      as: "purchaseBillItems",
      where: {
        itemName: {
          [Op.like]: `%${filters.itemName}%`,
        },
      },
      required: true,
    };
  }

  return await PurchaseBill.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["purchaseBillDate", "DESC"]],
    subQuery: false,
  });
};

// Convert Purchase Bill to Payment (Only Amount Required)
export const convertPurchaseBillToPayment = async (
  companyId: string,
  purchaseBillId: string,
  paymentData: { 
    paymentAmount: number;
    paymentNo: string;
    referenceNo: string;
    method: string;
    bankCharges?: number;
  },
  t: Transaction
) => {
  // Fetch the purchase bill
  const purchaseBill = await PurchaseBill.findOne({
    where: { id: purchaseBillId, companyId, isDeleted: false },
  });

  if (!purchaseBill) throw new Error("Purchase bill not found");
  if (purchaseBill.balance === 0) throw new Error("Purchase bill is already fully paid");
  if (paymentData.paymentAmount <= 0) throw new Error("Payment amount must be greater than 0");
  if (paymentData.paymentAmount > purchaseBill.balance) {
    throw new Error(`Payment amount cannot exceed bill balance of ${purchaseBill.balance}`);
  }

  const existingPayment = await Payments.findOne({
      where: {
        companyId,
        paymentNo: paymentData.paymentNo,
        isDeleted: false,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
  
    if (existingPayment) {
      throw new Error("Duplicate payment detected");
    }

  // Create payment (do not use invoiceId/purchaseBillId fields)
  const payment = await Payments.create(
    {
      companyId: purchaseBill.companyId,
      paymentType: "Payment Made",
      clientId: null,
      vendorId: purchaseBill.vendorId,
      paymentNo: paymentData.paymentNo,
      paymentAmount: paymentData.paymentAmount,
      paymentDate: new Date(),
      referenceNo: paymentData.referenceNo,
      method: paymentData.method as PaymentMethod,
      bankCharges: paymentData.bankCharges,
      amountReceived: paymentData.paymentAmount,
      amountUsedForPayments: paymentData.paymentAmount,
      amountInExcess: 0,
      memo: `Payment for Purchase Bill ${purchaseBill.invoiceNo}`,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t, validate: true }
  );

  // Link payment to purchase bill using PaymentsDocuments
  await PaymentsDocuments.create(
    {
      paymentId: payment.id,
      documentId: purchaseBill.id,
      documentType: "PurchaseBill",
      paymentValue: paymentData.paymentAmount,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t, validate: true }
  );

  // Update purchase bill balance and status
  const newBalance = Number(purchaseBill.balance) - paymentData.paymentAmount;
  const newStatus = newBalance === 0 ? "Closed" : "Partially Paid";

  await PurchaseBill.update(
    { 
      balance: parseFloat(newBalance.toFixed(2)),
      status: newStatus,
    },
    { where: { id: purchaseBillId }, transaction: t }
  );

  return {
    payment,
    convertedFromPurchaseBill: purchaseBillId,
    billNo: purchaseBill.invoiceNo,
    paidAmount: paymentData.paymentAmount,
    remainingBalance: newBalance,
    status: newStatus,
  };
};

