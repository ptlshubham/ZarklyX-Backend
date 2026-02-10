import crypto from "crypto";
import { Op, Transaction } from "sequelize";
import { PurchaseOrder } from "./purchase-order-model";
import { PurchaseOrderItem } from "./purchase-order-item-model";
import { Item } from "../item/item-model";
import { Vendor } from "../vendor/vendor-model";
import { PurchaseBill } from "../purchase-Bill/purchase-bill-model";
import { PurchaseBillItem } from "../purchase-Bill/purcharse-bill-item-model";
import { sendEmail } from "../../../../services/mailService";
import { Company } from "../../company/company-model";

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
  const baseAmount = quantity * unitPrice;
  const discountAmount = baseAmount * (discountPercentage / 100);
  const amountAfterDiscount = baseAmount - discountAmount;
  const taxAmount = (amountAfterDiscount * (tax / 100)) + (amountAfterDiscount * (cessPercentage / 100));
  const totalAmount = amountAfterDiscount + taxAmount;
  return {
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
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

interface PurchaseOrderCalculationResult {
  subTotal: number;
  finalDiscount: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  total: number;
  purchaseOrderItemsData: any[];
}


interface CreatePurchaseOrderInput {
  companyId: string;
  vendorId: string;
  placeOfSupply: string;
  poNo: string;
  poDate: Date;
  referenceNo: string;
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
  addDiscountToAll?: number;
  showCess: boolean;
  cessValue?: number;
  termsConditions?: string;
  privateNotes?: string;
}

// Shared calculation logic for purchase order totals
const calculatePurchaseOrderTotals = (
  items: any[],
  itemMap: Map<string, any>,
  addDiscountToAll: number | undefined,
  showCess: boolean,
  placeOfSupply: string,
  companyState: string,
  shippingAmount: number | undefined,
  shippingTax: number | undefined,
): PurchaseOrderCalculationResult => {
  let subTotal = 0;
  let finalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const purchaseOrderItemsData = items.map((inputItem) => {
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

  const total = subTotal + totalCgst + totalSgst + totalIgst + totalCess - finalDiscount + (shippingAmount || 0) ;
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
    purchaseOrderItemsData,
  };
};

// Create purchase order
export const createPurchaseOrder = async (body: CreatePurchaseOrderInput, t: Transaction) => {
  // Generate a unique publicToken
  const publicToken = crypto.randomBytes(32).toString("hex");
  const poDate = body.poDate || new Date();
  const validUntilDate = body.validUntilDate || new Date();

  // Fetch all items from database
  const itemIds = body.items.map(item => item.itemId);
  const itemsFromDb = await Item.findAll({
    where: { id: itemIds, companyId: body.companyId, isActive: true, isDeleted: false }
  });
  const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));
  if (itemsFromDb.length !== itemIds.length) {
    throw new Error("One or more items not found or inactive");
  }

  // Fetch vendor
  const vendor = await Vendor.findByPk(body.vendorId);
  if (!vendor) {
    throw new Error("Vendor not found");
  }
  const vendorState = vendor.state ?? "";

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  // Use shared calculation logic
  const calculated = calculatePurchaseOrderTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    body.placeOfSupply,
    vendorState,
    body.shippingAmount,
    body.shippingTax,
  );

  // Create purchase order
  const purchaseOrder = await PurchaseOrder.create(
    {
      companyId: body.companyId,
      vendorId: body.vendorId,
      placeOfSupply: body.placeOfSupply,
      poNo: body.poNo,
      poDate: poDate,
      referenceNo: body.referenceNo,
      validUntilDate: validUntilDate,
      status: 'Open',
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)),
      unitId: body.unitId || null,
      totalQuantity: null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountToAll: body.addDiscountToAll,
      showCess: body.showCess,
      cessValue: body.cessValue,
      termsConditions: body.termsConditions || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      taxable: parseFloat(calculated.taxable.toFixed(2)),
      cgst: parseFloat(calculated.totalCgst.toFixed(2)),
      sgst: parseFloat(calculated.totalSgst.toFixed(2)),
      igst: parseFloat(calculated.totalIgst.toFixed(2)),
      total: parseFloat(calculated.total.toFixed(2)),
      publicToken,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create purchase order items
  const createdItems = await PurchaseOrderItem.bulkCreate(
    calculated.purchaseOrderItemsData.map(item => ({
      ...item,
      poId: purchaseOrder.id,
    })),
    { transaction: t }
  );

  if (vendor?.email) {

    const baseUrl = process.env.ADMIN_URL || process.env.BASE_URL || process.env.APP_BASE_URL || '';
      if (!baseUrl) console.warn('ADMIN_URL not set — sending relative public-invoice link in email for invoice', purchaseOrder.id);
      const normalizedBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
      const purchaseOrderLink = normalizedBase ? `${normalizedBase}/public-invoice/${purchaseOrder.publicToken}` : `/public-invoice/${purchaseOrder.publicToken}`;

    await sendEmail({
      from: "" as any,
      to: vendor.email,
      subject: `Purchase Order ${purchaseOrder.poNo}`,
      htmlFile: "purchase-order-created",
      replacements: {
        vendorName: vendor.name || "Vendor",
        poNo: purchaseOrder.poNo,
        purchaseOrderLink,
        currentYear: new Date().getFullYear(),
      },
      html: null,
      text: "",
      attachments: null,
      cc: null,
      replyTo: null,
    });
  }
  return {
    purchaseOrder,
    items: createdItems,
  };
};

// Get purchase order by ID
export const getPurchaseOrderById = async (id: string, companyId: string) => {
  return await PurchaseOrder.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: PurchaseOrderItem,
        as: "purchaseOrderItems",
      },
      {
        model: Vendor,
        as: "vendor",
        attributes: ['id', 'name', 'email', 'phone', 'city', 'state'],
      }
    ],
  });
};

// Get all purchase orders for a company
export const getPurchaseOrdersByCompany = async (companyId: string) => {
    console.log("inside handler: ",companyId);
  return await PurchaseOrder.findAll({
    where: { companyId, isDeleted: false },
    order: [["poDate", "DESC"]],
    include: [
      {
        model: Vendor,
        as: "vendor",
        attributes: ['id', 'name', 'email', 'phone', 'city', 'state'],
      }
    ]
  });
};

// Update purchase order
export const updatePurchaseOrder = async (
  id: string,
  companyId: string,
  body: any,
  t: Transaction
) => {
  // Check if items or numerical values are being updated
  const needsRecalculation = body.items || body.shippingAmount !== undefined || 
    body.shippingTax !== undefined || body.addDiscountToAll !== undefined || 
    body.showCess !== undefined || body.cessValue !== undefined;

  if (needsRecalculation) {
    // Get existing purchase order
    const existingPO = await PurchaseOrder.findOne({
      where: { id, companyId, isDeleted: false },
      include: [{ model: PurchaseOrderItem, as: "purchaseOrderItems" }],
    });

    if (!existingPO) {
      throw new Error("Purchase order not found");
    }

    // Merge body with existing PO data
    const mergedData = {
      ...existingPO.toJSON(),
      ...body,
      items: body.items || (existingPO as any).purchaseOrderItems?.map((item: any) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        discount: item.discount,
      })) || [],
    };

    // Fetch items
    const itemIds = mergedData.items.map((item: any) => item.itemId);
    const itemsFromDb = await Item.findAll({
      where: { id: itemIds, companyId, isActive: true, isDeleted: false },
    });
    const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

    if (itemsFromDb.length !== itemIds.length) {
      throw new Error("One or more items not found or inactive");
    }

    // Fetch vendor
    const vendor = await Vendor.findByPk(mergedData.vendorId);
    if (!vendor) throw new Error("Vendor not found");
    const vendorState = vendor.state ?? "";

    // Use shared calculation logic
    const calculated = calculatePurchaseOrderTotals(
      mergedData.items,
      itemMap,
      mergedData.addDiscountToAll,
      mergedData.showCess,
      mergedData.placeOfSupply,
      vendorState,
      mergedData.shippingAmount,
      mergedData.shippingTax,
    );

    await PurchaseOrder.update(
      {
        ...body,
        subTotal: parseFloat(Number(calculated.subTotal).toFixed(2)),
        finalDiscount: parseFloat(Number(calculated.finalDiscount).toFixed(2)),
        taxable: parseFloat(Number(calculated.taxable).toFixed(2)),
        cgst: parseFloat(Number(calculated.totalCgst).toFixed(2)),
        sgst: parseFloat(Number(calculated.totalSgst).toFixed(2)),
        igst: parseFloat(Number(calculated.totalIgst).toFixed(2)),
        total: parseFloat(Number(calculated.total).toFixed(2)),
      },
      { where: { id, companyId, isDeleted: false }, transaction: t }
    );

    await PurchaseOrderItem.destroy({ where: { poId: id }, transaction: t });
    await PurchaseOrderItem.bulkCreate(
      calculated.purchaseOrderItemsData.map((item: any) => ({ ...item, poId: id })),
      { transaction: t }
    );

    return [1];
  } else {
    return await PurchaseOrder.update(body, {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    });
  }
};

// Soft delete purchase order
export const deletePurchaseOrder = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Fetch purchase order with lock
  const purchaseOrder = await PurchaseOrder.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!purchaseOrder) {
    throw new Error("Purchase order not found");
  }

  // Status validation: Cannot delete if already converted to Purchase Bill
  if (purchaseOrder.status === "Converted") {
    throw new Error(
      "Converted purchase orders cannot be deleted"
    );
  }

  // Soft delete purchase order items
  await PurchaseOrderItem.update(
    { isActive: false, isDeleted: true },
    {
      where: { poId: id },
      transaction: t,
    }
  );

  // Soft delete purchase order
  await PurchaseOrder.update(
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
    message: "Purchase order deleted successfully",
    purchaseOrderId: id,
  };
};

// Search invoices with filters
export interface SearchPurchaseOrderFilters {
  companyId: string;
  vendorName?: string;
  poNo?: string;
  status?: string;
  city?: string;
  itemName?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

export const searchPurchaseOrder = async (filters: SearchPurchaseOrderFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by purchase order number
  if (filters.poNo) {
    whereConditions.poNo = {
      [Op.like]: `%${filters.poNo}%`,
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
    whereConditions.poDate = dateFilter;
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
      model: PurchaseOrderItem,
      as: "purchaseOrderItems",
    },
  ];

  // Filter by client name
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
      model: PurchaseOrderItem,
      as: "purchaseOrderItems",
      where: {
        itemName: {
          [Op.like]: `%${filters.itemName}%`,
        },
      },
      required: true,
    };
  }

  return await PurchaseOrder.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["poDate", "DESC"]],
    subQuery: false,
  });
};

// Convert Purchase Order to Purchase Bill (Exact Copy)
export const convertPurchaseOrderToBill = async (
  poId: string,
  companyId: string,
  billData: { invoiceNo: string; dueDate: Date },
  t: Transaction
) => {
  // Fetch the purchase order with items
  const po = await PurchaseOrder.findOne({
    where: { id: poId, companyId, isDeleted: false },
    include: [
      {
        model: PurchaseOrderItem,
        as: "purchaseOrderItems",
      },
    ],
  });
  
  if (!po) throw new Error("Purchase order not found");
  if (po.status === "Converted") throw new Error("Purchase order already converted");

  // Create exact copy of purchase order as purchase bill
  const bill = await PurchaseBill.create(
    {
      companyId: po.companyId,
      vendorId: po.vendorId,
      placeOfSupply: po.placeOfSupply,
      invoiceNo: billData.invoiceNo,
      purchaseBillDate: new Date(),
      status: 'Open',
      poNo: po.poNo,
      poDate: po.poDate,
      dueDate: billData.dueDate,
      purchaseBillNo: `PB-${Date.now()}`,
      finalDiscount: po.finalDiscount,
      unitId: po.unitId,
      totalQuantity: po.totalQuantity,
      shippingChargeType: po.shippingChargeType,
      shippingAmount: po.shippingAmount,
      shippingTax: po.shippingTax,
      addDiscountToAll: po.addDiscountToAll,
      showCess: po.showCess,
      cessValue: po.cessValue,
      reverseCharge: false,
      termsConditions: po.termsConditions,
      privateNotes: po.privateNotes,
      subTotal: po.subTotal,
      cgst: po.cgst,
      sgst: po.sgst,
      igst: po.igst,
      total: po.total,
      balance: po.total,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Copy all items from purchase order
  const poItems = (po as any).purchaseOrderItems || [];
  await PurchaseBillItem.bulkCreate(
    poItems.map((item: any) => ({
      purchaseBillId: bill.id,
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
    { transaction: t }
  );

  // Update PO status to Converted
  await PurchaseOrder.update(
    { status: "Converted" },
    { where: { id: poId }, transaction: t }
  );

  return {
    bill,
    convertedFromPurchaseOrder: poId,
  };
};

// Get purchase order by public token (public preview)
export const getPurchaseOrderByPublicToken = async (publicToken: string) => {
  return await PurchaseOrder.findOne({
    where: { publicToken, isDeleted: false },
    include: [
      { model: Vendor, as: "vendor" },
      { model: Company, as: "company" },
    ],
  });
};