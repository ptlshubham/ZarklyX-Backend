import { Op, Transaction } from "sequelize";
import { Invoice } from "./invoice-model";
import { InvoiceItem } from "./invoice-item-model";
import { Item } from "../item/item-model";
import { InvoiceTdsTcs } from "./tds-tcs/invoice-tds-tcs-model";
import { Company } from "../../company/company-model";
import { Clients } from "../../agency/clients/clients-model";
import { Payments, PaymentMethod } from "../payments/payments-model";
import { PaymentsDocuments } from "../payments/payments-documents-model";
import { PaymentTerms, TaxSelection } from "./invoice-model";
import { sendEmail } from "../../../../services/mailService";
import crypto from 'crypto';

export type InvoiceStatus =
  | "Draft"
  | "Unpaid"
  | "Partially Paid"
  | "Paid"
  | "Overdue"
  | "Cancelled";

export type InvoiceType = "tax Invoice" | "bill Of Supply";

// Helper function to calculate due date based on payment terms
export const calculateDueDate = (invoiceDate: Date, paymentTerms: string, specificDate?: Date): Date => {
  if (paymentTerms === "specific date" && specificDate) {
    return specificDate;
  }

  const dueDate = new Date(invoiceDate);
  
  switch (paymentTerms) {
    case "NET 7":
      dueDate.setDate(dueDate.getDate() + 7);
      break;
    case "NET 10":
      dueDate.setDate(dueDate.getDate() + 10);
      break;
    case "NET 15":
      dueDate.setDate(dueDate.getDate() + 15);
      break;
    case "NET 30":
      dueDate.setDate(dueDate.getDate() + 30);
      break;
    case "NET 45":
      dueDate.setDate(dueDate.getDate() + 45);
      break;
    case "NET 60":
      dueDate.setDate(dueDate.getDate() + 60);
      break;
    case "hide payment terms":
      // No due date for hidden payment terms
      return dueDate;
    default:
      // Default to invoice date
      return dueDate;
  }
  
  return dueDate;
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


interface InvoiceCalculationResult {
  subTotal: number;
  finalDiscount: number;
  taxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  total: number;
  invoiceItemsData: any[];
}

export interface CreateInvoiceInput {
  companyId: string;
  invoiceType: InvoiceType;
  clientId: string;
  taxSelectionOn: TaxSelection;
  placeOfSupply: string;
  invoiceNo: string;
  invoiceDate: Date;
  poNo: string;
  poDate: Date;
  paymentTerms: PaymentTerms;
  specificDueDate?: Date; // For "specific date" payment term
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
  addDiscountTotal?: number; // Discount on subtotal (fixed amount)
  addDiscountToAll?: number; // Discount distributed to all items
  customAmountLabel?: string;
  customAmount?: number;
  showCess: boolean;
  reverseCharge: boolean;
  tdsTcsEntries?: Array<{
    taxPercentage: number;
    type: string;
    taxName: string;
    applicableOn: string; // "taxable" or "total"
  }>;
  // E-way bill details
  eWayBillNo?: string;
  dispatchFrom?: string;
  lrNo?: string;
  challanNo?: string;
  vehicleNo?: string;
  transportMode?: string;
  transactionType?: string;
  shippingDistanceInKm?: number;
  transporterName?: string;
  transporterId?: number;
  transporterGstin?: string;
  transporterDocDate?: Date;
  transporterDocNo?: number;
  termsConditions?: string;
  privateNotes?: string;
}

// Shared calculation logic for invoice totals
const calculateInvoiceTotals = (
  items: any[],
  itemMap: Map<string, any>,
  addDiscountToAll: number | undefined,
  showCess: boolean,
  isTaxInvoice: boolean,
  placeOfSupply: string,
  companyState: string,
  shippingAmount: number | undefined,
  shippingTax: number | undefined,
  customAmount: number | undefined,
  addDiscountTotal: number | undefined,
  reverseCharge: boolean | undefined,
  tdsTcsEntries: any[] | undefined
): InvoiceCalculationResult => {
  let subTotal = 0;
  let finalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const invoiceItemsData = items.map((inputItem) => {
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

    const taxTotals = applyTaxSplit(amountForTax, itemTax, placeOfSupply.toLowerCase !== companyState.toLowerCase, {
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
      if (placeOfSupply.toLowerCase !== companyState.toLowerCase) {
        totalIgst += shippingTaxAmount;
      } else {
        totalCgst += shippingTaxAmount / 2;
        totalSgst += shippingTaxAmount / 2;
      }
    }
  }

  const customAmountValue = customAmount || 0;
  const discountOnTotal = addDiscountTotal || 0;
  
  let totalBeforeTdsTcs;
  if(reverseCharge){
   totalBeforeTdsTcs = subTotal  - finalDiscount + (shippingAmount || 0) + customAmountValue - discountOnTotal;
  } else {
    totalBeforeTdsTcs = subTotal + totalCgst + totalSgst + totalIgst + totalCess - finalDiscount + (shippingAmount || 0) + customAmountValue - discountOnTotal;
  }
  

  // Calculate TDS and TCS amounts
  let totalTds = 0;
  let totalTcs = 0;
  const taxableBase = subTotal - finalDiscount;
  // Invoice total BEFORE TDS/TCS
  const totalBase = reverseCharge
    ? taxableBase
        + (shippingAmount || 0)
        + (customAmount || 0)
        - (addDiscountTotal || 0)
    : taxableBase
        + totalCgst
        + totalSgst
        + totalIgst
        + totalCess
        + (shippingAmount || 0)
        + (customAmount || 0)
        - (addDiscountTotal || 0);
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
    invoiceItemsData,
  };
};

// Create invoice with all related data
export const createInvoice = async (body: CreateInvoiceInput, t: Transaction) => {
  // Generate a unique public token for sharing
  const publicToken = crypto.randomBytes(16).toString('hex');

  // Calculate due date based on payment terms
  const invoiceDate = body.invoiceDate || new Date();
  const dueDate = calculateDueDate(
    invoiceDate,
    body.paymentTerms,
    body.specificDueDate
  );

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
  const company = await Company.findByPk(body.companyId,{ transaction: t} );
  if (!company) {
    throw new Error("Company not found");
  }
  const companyState: string = company.state ?? "";

  // Validate that all items have unitId
  const itemsWithoutUnit = itemsFromDb.filter(item => !item.unitId);
  if (itemsWithoutUnit.length > 0) {
    throw new Error(`Items must have a unit assigned: ${itemsWithoutUnit.map(i => i.itemName).join(', ')}`);
  }

  const isTaxInvoice = body.invoiceType.toLowerCase() === "tax invoice";

  // Use shared calculation logic
  const calculated = calculateInvoiceTotals(
    body.items,
    itemMap,
    body.addDiscountToAll,
    body.showCess,
    isTaxInvoice,
    body.placeOfSupply,
    companyState,
    body.shippingAmount,
    body.shippingTax,
    body.customAmount,
    body.addDiscountTotal,
    body.reverseCharge,
    body.tdsTcsEntries
  );

  // Create invoice
  const invoice = await Invoice.create(
    {
      companyId: body.companyId,
      invoiceType: body.invoiceType,
      clientId: body.clientId,
      taxSelectionOn: body.taxSelectionOn,
      placeOfSupply: body.placeOfSupply,
      invoiceNo: body.invoiceNo,
      invoiceDate,
      poNo: body.poNo,
      poDate: body.poDate,
      dueDate,
      status: 'Unpaid',
      paymentTerms: body.paymentTerms,
      unitId: body.unitId || null,
      shippingChargeType: body.shippingChargeType || null,
      shippingAmount: body.shippingAmount,
      shippingTax: body.shippingTax,
      addDiscountTotal: body.addDiscountTotal,
      addDiscountToAll: body.addDiscountToAll,
      customAmountLabel: body.customAmountLabel || null,
      customAmount: body.customAmount,
      showCess: body.showCess,
      reverseCharge: body.reverseCharge,
      eWayBillNo: body.eWayBillNo || null,
      dispatchFrom: body.dispatchFrom || null,
      lrNo: body.lrNo || null,
      challanNo: body.challanNo || null,
      vehicleNo: body.vehicleNo || null,
      transportMode: body.transportMode || null,
      transactionType: body.transactionType || null,
      shippingDistanceInKm: body.shippingDistanceInKm || null,
      transporterName: body.transporterName || null,
      transporterId: body.transporterId || null,
      transporterGstin: body.transporterGstin || null,
      transporterDocDate: body.transporterDocDate || null,
      transporterDocNo: body.transporterDocNo || null,
      termsConditions: body.termsConditions || null,
      privateNotes: body.privateNotes || null,
      subTotal: parseFloat(calculated.subTotal.toFixed(2)),
      finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)),
      taxable: calculated.taxable,
      cgst: parseFloat(calculated.totalCgst.toFixed(2)),
      sgst: parseFloat(calculated.totalSgst.toFixed(2)),
      igst: parseFloat(calculated.totalIgst.toFixed(2)),
      cessValue: parseFloat(calculated.totalCess.toFixed(2)),
      total: parseFloat(calculated.total.toFixed(2)),
      balance: parseFloat(calculated.total.toFixed(2)),
      publicToken,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // Create invoice items
  const createdInvoiceItems = await InvoiceItem.bulkCreate(
    calculated.invoiceItemsData.map(item => ({
      ...item,
      invoiceId: invoice.id,
    })),
    { transaction: t, validate: true }
  );

  // Calculate base amounts for TDS/TCS (should match the calculation logic)
  const taxableBase = calculated.subTotal - calculated.finalDiscount;

  const totalBase = body.reverseCharge
    ? taxableBase
        + (body.shippingAmount || 0)
        + (body.customAmount || 0)
        - (body.addDiscountTotal || 0)
    : taxableBase
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

    createdTdsTcs = await InvoiceTdsTcs.bulkCreate(
      body.tdsTcsEntries.map(entry => {
        const baseAmount = entry.applicableOn === "total" ? totalBase : taxableBase;

        const taxAmount = baseAmount * (entry.taxPercentage / 100);

        return {
          companyId: body.companyId,
          invoiceId: invoice.id,
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

  const client = await Clients.findByPk(invoice.clientId,{ transaction: t} );

  if (client && client.email) {
    try {
      await sendEmail({
        from: "varadchaudhari04@gmail.com",
        to: "varadchaudhari0210@gmail.com",
        subject: `Invoice ${invoice.invoiceNo}`,
        htmlFile: "invoice-created",
        replacements: {
          userName: client.clientfirstName || "Customer",
          invoiceNo: invoice.invoiceNo,
          invoiceDate: invoice.invoiceDate,
          total: invoice.total,
          dueDate: invoice.dueDate,
          documentLink: `${process.env.BASE_URL}/document/${publicToken}`,
          currentYear: new Date().getFullYear(),
        },
        html: null,
        text: "",
        attachments: null,
        cc: null,
        replyTo: null,
      });
    } catch (error) {
      throw new Error("Invoice create email failed ")
    }
  } else{
    throw new Error();
  }


  return {
    invoice,
    invoiceItems: createdInvoiceItems,
    invoiceTdsTcs: createdTdsTcs,
    documentLink: `${process.env.BASE_URL}/document/${publicToken}`,
  };
};

// Get invoice by ID with all related data
export const getInvoiceById = async (id: string, companyId: string) => {
  return await Invoice.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
      },
      {
        model: Company,
        as: "company",
      },
      {
        model: InvoiceItem,
        as: "invoiceItems",
      },
      {
        model: InvoiceTdsTcs,
        as: "tdsTcsEntries",
      },
    ],
  });
};

// Get all invoices for a company
export const getInvoicesByCompany = async (companyId: string) => {
  return await Invoice.findAll({
    where: { companyId, isDeleted: false },
    order: [["invoiceDate", "DESC"]],
  });
};

// Get invoices by client
export const getInvoicesByClient = async (clientId: string, companyId: string): Promise<any> => {
  return await Invoice.findAll({
    where: { clientId, companyId, isDeleted: false },
    order: [["invoiceDate", "DESC"]],
  });
};

// Update invoice
export const updateInvoice = async (
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

  if (needsRecalculation) {
    // Get existing invoice
    const existingInvoice = await Invoice.findOne({
      where: { id, companyId, isDeleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [
        { model: InvoiceItem, as: "invoiceItems" },
        { model: InvoiceTdsTcs, as: "tdsTcsEntries" },
      ],
    });

    if (!existingInvoice) {
      throw new Error("Invoice not found");
    }

    // Merge body with existing invoice data
    const mergedData = {
      ...existingInvoice.toJSON(),
      ...body,
      items: body.items || (existingInvoice as any).invoiceItems?.map((item: any) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        discount: item.discount,
      })) || [],
    };

    // Recalculate everything
    const invoiceDate = mergedData.invoiceDate || new Date();
    const dueDate = mergedData.dueDate || existingInvoice.dueDate;

    // Fetch items
    const itemIds = mergedData.items.map((item: any) => item.itemId);
    const itemsFromDb = await Item.findAll({
      where: { id: itemIds, companyId, isActive: true, isDeleted: false },
    });
    const itemMap = new Map(itemsFromDb.map(item => [item.id, item]));

    if (itemsFromDb.length !== itemIds.length) {
      throw new Error("One or more items not found or inactive");
    }

    // Fetch company
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error("Company not found");
    const companyState: string = company.state ?? "";

    const isTaxInvoice = mergedData.invoiceType?.toLowerCase() === "tax invoice";

    // Use shared calculation logic
    const calculated = calculateInvoiceTotals(
      mergedData.items,
      itemMap,
      mergedData.addDiscountToAll,
      mergedData.showCess,
      isTaxInvoice,
      mergedData.placeOfSupply,
      companyState,
      mergedData.shippingAmount,
      mergedData.shippingTax,
      mergedData.customAmount,
      mergedData.addDiscountTotal,
      mergedData.reverseCharge,
      mergedData.tdsTcsEntries
    );
    // Check payment status before modification
    if (["Paid", "Partially Paid"].includes((existingInvoice as any).status)) {
      throw new Error("Invoices with payments cannot be modified");
    }

    // Calculate paid amount from PaymentsDocuments
    const paymentDocs = await PaymentsDocuments.findAll({
      where: { documentId: id, documentType: "Invoice" },
      transaction: t,
    });
    const paidAmount = paymentDocs.reduce((sum, doc) => sum + Number(doc.paymentValue), 0);

    const newBalance = calculated.total - paidAmount;
    if (newBalance < 0) {
      throw new Error("Invoice total cannot be less than paid amount");
    }


    await Invoice.update(
      {
        ...body,
        subTotal: parseFloat(calculated.subTotal.toFixed(2)),
        finalDiscount: parseFloat(calculated.finalDiscount.toFixed(2)),
        taxable: calculated.taxable,
        cgst: parseFloat(calculated.totalCgst.toFixed(2)),
        sgst: parseFloat(calculated.totalSgst.toFixed(2)),
        igst: parseFloat(calculated.totalIgst.toFixed(2)),
        cessValue: parseFloat(calculated.totalCess.toFixed(2)),
        total: parseFloat(calculated.total.toFixed(2)),
        balance: parseFloat(newBalance.toFixed(2)),
      },
      { where: { id, companyId, isDeleted: false }, transaction: t }
    );

    await InvoiceItem.destroy({ where: { invoiceId: id }, transaction: t });
    await InvoiceItem.bulkCreate(
      calculated.invoiceItemsData.map((item: any) => ({ ...item, invoiceId: id })),
      { transaction: t, validate: true }
    );

    if (mergedData.tdsTcsEntries) {
      await InvoiceTdsTcs.destroy({ where: { invoiceId: id }, transaction: t });
      if (mergedData.tdsTcsEntries.length > 0) {
        // Calculate base amounts for TDS/TCS (should match the calculation logic)
        const taxableBase = calculated.subTotal - calculated.finalDiscount;

        const totalBase = mergedData.reverseCharge
          ? taxableBase
              + (mergedData.shippingAmount || 0)
              + (mergedData.customAmount || 0)
              - (mergedData.addDiscountTotal || 0)
          : taxableBase
              + calculated.totalCgst
              + calculated.totalSgst
              + calculated.totalIgst
              + calculated.totalCess
              + (mergedData.shippingAmount || 0)
              + (mergedData.customAmount || 0)
              - (mergedData.addDiscountTotal || 0);

        
        await InvoiceTdsTcs.bulkCreate(
          mergedData.tdsTcsEntries.map((entry: any) => {
            const baseAmount = entry.applicableOn === "total" ? totalBase : taxableBase;

            const taxAmount = baseAmount * (entry.taxPercentage / 100);

            return {
              companyId,
              invoiceId: id,
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

    return [1];
  } else {
    await Invoice.update(body, {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    });
    return await getInvoiceById(id, companyId);
  }
};

// Soft delete invoice
export const deleteInvoice = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Fetch invoice with lock
  const invoice = await Invoice.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Status validation
  if (["Paid", "Partially Paid"].includes(invoice.status)) {
    throw new Error(
      "Paid or partially paid invoices cannot be deleted"
    );
  }

  // Check if payments exist
  const paymentCount = await PaymentsDocuments.count({
    where: {
      documentId: id,
      documentType: "Invoice",
    },
    transaction: t,
  });

  if (paymentCount > 0) {
    throw new Error(
      "Invoice with payments cannot be deleted. Cancel it instead."
    );
  }

  // Soft delete invoice items
  await InvoiceItem.update(
    { isDeleted: true },
    {
      where: { invoiceId: id },
      transaction: t,
    }
  );

  // Soft delete TDS/TCS entries
  await InvoiceTdsTcs.update(
    { isActive: false, isDeleted: true },
    {
      where: { invoiceId: id },
      transaction: t,
    }
  );

  // Soft delete invoice itself
  await Invoice.update(
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
    message: "Invoice deleted successfully",
    invoiceId: id,
  };
};


// Search invoices with filters
export interface SearchInvoiceFilters {
  companyId: string;
  clientName?: string;
  invoiceNo?: string;
  status?: string;
  city?: string;
  type?: string; // invoiceType
  itemName?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
}

export const searchInvoices = async (filters: SearchInvoiceFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  // Filter by invoice number
  if (filters.invoiceNo) {
    whereConditions.invoiceNo = {
      [Op.like]: `%${filters.invoiceNo}%`,
    };
  }

  // Filter by status
  if (filters.status) {
    whereConditions.status = filters.status;
  }

  // Filter by invoice type
  if (filters.type) {
    whereConditions.invoiceType = filters.type;
  }

  // Filter by issue date range
  if (filters.issueDateFrom || filters.issueDateTo) {
    const dateFilter: any = {};
    if (filters.issueDateFrom) dateFilter[Op.gte] = filters.issueDateFrom;
    if (filters.issueDateTo) dateFilter[Op.lte] = filters.issueDateTo;
    whereConditions.invoiceDate = dateFilter;
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
      model: InvoiceItem,
      as: "invoiceItems",
    },
    {
      model: InvoiceTdsTcs,
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
      model: InvoiceItem,
      as: "invoiceItems",
      where: {
        itemName: {
          [Op.like]: `%${filters.itemName}%`,
        },
      },
      required: true,
    };
  }

  return await Invoice.findAll({
    where: whereConditions,
    include: includeArray,
    order: [["invoiceDate", "DESC"]],
    subQuery: false,
  });
};

// Convert Invoice to Payment (Only Amount Required)
export const convertInvoiceToPayment = async (
  invoiceId: string,
  companyId: string,
  paymentData: { 
    paymentAmount: number;
    paymentNo: string;
    referenceNo: string;
    method: string;
    bankCharges?: number;
  },
  t: Transaction
) => {
  // Fetch the invoice
  const invoice = await Invoice.findOne({
    where: { id: invoiceId, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.balance === 0) throw new Error("Invoice is already fully paid");
  if (paymentData.paymentAmount <= 0) throw new Error("Payment amount must be greater than 0");
  if (paymentData.paymentAmount > invoice.balance) {
    throw new Error(`Payment amount cannot exceed invoice balance of ${invoice.balance}`);
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

  // Create payment from invoice
  const payment = await Payments.create(
    {
      companyId: invoice.companyId,
      paymentType: "Payment Received",
      clientId: invoice.clientId,
      vendorId: null,
      paymentNo: paymentData.paymentNo,
      paymentAmount: paymentData.paymentAmount,
      paymentDate: new Date(),
      referenceNo: paymentData.referenceNo,
      method: paymentData.method as PaymentMethod,
      bankCharges: paymentData.bankCharges,
      amountReceived: paymentData.paymentAmount,
      amountUsedForPayments: paymentData.paymentAmount,
      amountInExcess: 0,
      memo: `Payment for Invoice ${invoice.invoiceNo}`,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t, validate: true }
  );

  // Link payment to invoice using PaymentsDocuments
  await PaymentsDocuments.create(
    {
      paymentId: payment.id,
      documentId: invoice.id,
      documentType: "Invoice",
      paymentValue: paymentData.paymentAmount,
      isActive: true,
      isDeleted: false,
    },
    { transaction: t, validate: true }
  );

  // Update invoice balance and status
  const newBalance = Number(invoice.balance) - paymentData.paymentAmount;
  let newStatus: InvoiceStatus;
  if (newBalance === 0) {
    newStatus = "Paid";
  } else if (newBalance < Number(invoice.total)) {
    newStatus = "Partially Paid";
  } else {
    newStatus = "Unpaid";
  }


  await Invoice.update(
    { 
      balance: parseFloat(newBalance.toFixed(2)),
      status: newStatus,
    },
    { where: { id: invoiceId }, transaction: t }
  );
  
  // const client = await Clients.findByPk(invoice.clientId);
  const client = await Clients.findOne({
    where: { id: invoice.clientId }
  });
  const company = await Company.findByPk(companyId,{ transaction: t} );
  if(!client){
    throw new Error("Client not found");
  }

    if(newBalance === 0){
      try {
        await sendEmail({
          from: company && company.email ? company.email : "",
          to: client.email,
          subject: `Payment received for Invoice ${invoice.invoiceNo}`,
          htmlFile: "payment-received",
          replacements: {
            userName: client.clientfirstName || "Customer",
            invoiceNo: invoice.invoiceNo,
            amount: paymentData.paymentAmount,
            currentYear: new Date().getFullYear(),
          },
          html: null,
          text: "",
          attachments: null,
          cc: null,
          replyTo: null,
        });
      } catch (error) {
          throw new Error("Invoice convert email failed");
      }
    } else{
      try {
        await sendEmail({
          from: (company && company.email) ? company.email : "",
          to: client.email,
          subject: `Partial Payment received for Invoice ${invoice.invoiceNo}`,
          htmlFile: "partial-payment-received",
          replacements: {
            userName: client.clientfirstName || "Customer",
            invoiceNo: invoice.invoiceNo,
            amount: paymentData.paymentAmount,
            currentYear: new Date().getFullYear(),
            remainingBalance: newBalance,
          },
          html: null,
          text: "",
          attachments: null,
          cc: null,
          replyTo: null,
        });
      } catch (error) {
          throw new Error("Invoice convert email failed");
      }
    }
  return {
    payment,
    convertedFromInvoice: invoiceId,
    invoiceNo: invoice.invoiceNo,
    paidAmount: paymentData.paymentAmount,
    remainingBalance: newBalance,
    status: newStatus,
  };
};

// Handler to fetch invoice by publicToken, including related data
export const getInvoiceByPublicToken = async (publicToken: string) => {
  return await Invoice.findOne({
    where: { publicToken, isDeleted: false },
    include: [
      {
        model: InvoiceItem,
        as: "invoiceItems",
      },
      {
        model: InvoiceTdsTcs,
        as:"tdsTcsEntries",
      },
      {
        model: Clients,
        as: "client",
      },
      {
        model: Company,
        as: "company",
      },
    ],
  });
};