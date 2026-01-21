import { Op, Transaction } from "sequelize";
import { Payments, PaymentMethod, PaymentType } from "./payments-model";
import { Invoice } from "../invoice/invoice-model";
import { PurchaseBill } from "../purchase-Bill/purchase-bill-model";
import { Clients } from "../../agency/clients/clients-model";
import { Vendor } from "../vendor/vendor-model";
import { PaymentsDocuments, DocumentType } from "./payments-documents-model";

export interface DocumentPayment {
  documentId: string;
  documentType: DocumentType;
  paymentValue: number;
}

export interface CreatePaymentInput {
  companyId: string;
  paymentType: PaymentType;
  clientId?: string;
  vendorId?: string;
  paymentNo: string;
  paymentAmount: number;
  paymentDate?: Date;
  referenceNo?: string;
  method: PaymentMethod;
  bankCharges?: number;
  memo?: string;
  documents: DocumentPayment[];
}

// Helper function to update document balance and status
const updateDocumentBalance = async (
  documentId: string,
  documentType: DocumentType,
  paymentValue: number,
  companyId: string,
  isReversal: boolean,
  t: Transaction
) => {
  if (documentType === "Invoice") {
    const invoice = await Invoice.findOne({
      where: { id: documentId, companyId, isDeleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!invoice) {
      throw new Error(`Invoice ${documentId} not found`);
    }

    const currentBalance = invoice.balance ?? invoice.total ?? 0;
    const newBalance = isReversal
      ? currentBalance + paymentValue
      : currentBalance - paymentValue;

    // Validate payment value
    if (!isReversal && paymentValue > currentBalance) {
      throw new Error(
        `Payment value ${paymentValue} exceeds invoice balance ${currentBalance}`
      );
    }

    // Determine new status
    let newStatus = invoice.status;
    if (newBalance <= 0) {
      newStatus = "Paid";
    } else if (newBalance < (invoice.total ?? 0)) {
      newStatus = "Partially Paid";
    } else {
      newStatus = "Unpaid";
    }

    await Invoice.update(
      { balance: parseFloat(newBalance.toFixed(2)), status: newStatus },
      { where: { id: documentId }, transaction: t }
    );
  } else if (documentType === "PurchaseBill") {
    const bill = await PurchaseBill.findOne({
      where: { id: documentId, companyId, isDeleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!bill) {
      throw new Error(`Purchase Bill ${documentId} not found`);
    }

    const currentBalance = bill.balance ?? bill.total ?? 0;
    const newBalance = isReversal
      ? currentBalance + paymentValue
      : currentBalance - paymentValue;

    // Validate payment value
    if (!isReversal && paymentValue > currentBalance) {
      throw new Error(
        `Payment value ${paymentValue} exceeds bill balance ${currentBalance}`
      );
    }

    // Determine new status
    let newStatus = bill.status;
    if (newBalance <= 0) {
      newStatus = "paid";
    } else if (newBalance < (bill.total ?? 0)) {
      newStatus = "partially paid";
    } else {
      newStatus = "unpaid";
    }

    await PurchaseBill.update(
      { balance: parseFloat(newBalance.toFixed(2)), status: newStatus },
      { where: { id: documentId }, transaction: t }
    );
  }
};

// Create payment with document links
export const createPayment = async (body: CreatePaymentInput, t: Transaction) => {
  const {
    companyId,
    paymentType,
    clientId,
    vendorId,
    paymentNo,
    paymentAmount,
    paymentDate,
    referenceNo,
    method,
    bankCharges,
    memo,
    documents,
  } = body;

  // Check for duplicate payment number
  const existingPayment = await Payments.findOne({
    where: { companyId, paymentNo, isDeleted: false },
    transaction: t,
  });

  if (existingPayment) {
    throw new Error(`Payment number ${paymentNo} already exists`);
  }

  // Validate payment type and related entities
  if (
    paymentType === "Payment Received" ||
    paymentType === "Advance Payment Received"
  ) {
    if (!clientId) {
      throw new Error("clientId is required for payment received");
    }

    // Verify client exists
    const client = await Clients.findOne({
      where: { id: clientId, companyId, isDeleted: false },
      transaction: t,
    });

    if (!client) {
      throw new Error("Client not found");
    }

    // Verify all invoices belong to this client
    for (const doc of documents) {
      if (doc.documentType === "Invoice") {
        const invoice = await Invoice.findOne({
          where: { id: doc.documentId, companyId, clientId, isDeleted: false },
          transaction: t,
        });

        if (!invoice) {
          throw new Error(
            `Invoice ${doc.documentId} not found or does not belong to this client`
          );
        }
      }
    }
  } else if (
    paymentType === "Payment Made" ||
    paymentType === "Advance Payment Made"
  ) {
    if (!vendorId) {
      throw new Error("vendorId is required for payment made");
    }

    // Verify vendor exists
    const vendor = await Vendor.findOne({
      where: { id: vendorId, companyId, isDeleted: false },
      transaction: t,
    });

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify all purchase bills belong to this vendor
    for (const doc of documents) {
      if (doc.documentType === "PurchaseBill") {
        const bill = await PurchaseBill.findOne({
          where: { id: doc.documentId, companyId, vendorId, isDeleted: false },
          transaction: t,
        });

        if (!bill) {
          throw new Error(
            `Purchase Bill ${doc.documentId} not found or does not belong to this vendor`
          );
        }
      }
    }
  }

  // Calculate summary fields
  let amountUsedForPayments = 0;
  for (const doc of documents) {
    amountUsedForPayments += doc.paymentValue;
  }

  const amountInExcess = paymentAmount - amountUsedForPayments;

  // Validate total payment values don't exceed payment amount
  if (amountUsedForPayments > paymentAmount) {
    throw new Error(
      `Total payment values (${amountUsedForPayments}) exceed payment amount (${paymentAmount})`
    );
  }

  // Process each document payment
  for (const doc of documents) {
    await updateDocumentBalance(
      doc.documentId,
      doc.documentType,
      doc.paymentValue,
      companyId,
      false,
      t
    );
  }

  // Create payment record
  const payment = await Payments.create(
    {
      companyId,
      paymentType,
      clientId: clientId ?? null,
      vendorId: vendorId ?? null,
      paymentNo,
      paymentAmount: parseFloat(paymentAmount.toFixed(2)),
      paymentDate: paymentDate || new Date(),
      referenceNo: referenceNo || null,
      method,
      bankCharges: bankCharges ? parseFloat(bankCharges.toFixed(2)) : 0,
      memo: memo || null,
      amountReceived: parseFloat(paymentAmount.toFixed(2)),
      amountUsedForPayments: parseFloat(amountUsedForPayments.toFixed(2)),
      amountInExcess: parseFloat(amountInExcess.toFixed(2)),
      status: "Active",
      isActive: true,
      isDeleted: false,
    },
    { transaction: t, validate: true }
  );

  // Link payment to documents
  for (const doc of documents) {
    await PaymentsDocuments.create(
      {
        paymentId: payment.id,
        documentId: doc.documentId,
        documentType: doc.documentType,
        paymentValue: parseFloat(doc.paymentValue.toFixed(2)),
      },
      { transaction: t, validate: true }
    );
  }

  return payment;
};

// Get payment by ID with documents
export const getPaymentById = async (id: string, companyId: string) => {
  const payment = await Payments.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
        required: false,
        attributes: ["id", "businessName", "clientfirstName", "clientLastName"],
      },
      {
        model: Vendor,
        as: "vendor",
        required: false,
        attributes: ["id", "companyName", "firstName", "lastName"],
      },
    ],
  });

  if (!payment) return null;

  const documents = await PaymentsDocuments.findAll({
    where: { paymentId: id },
  });

  return { ...payment.toJSON(), documents };
};

// Get all payments for a company with documents
export const getPaymentsByCompany = async (companyId: string) => {
  const payments = await Payments.findAll({
    where: { companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
        required: false,
        attributes: ["id", "businessName", "clientfirstName", "clientLastName"],
      },
      {
        model: Vendor,
        as: "vendor",
        required: false,
        attributes: ["id", "companyName", "firstName", "lastName"],
      },
    ],
    order: [["paymentDate", "DESC"]],
  });

  return await Promise.all(
    payments.map(async (p) => {
      const docs = await PaymentsDocuments.findAll({
        where: { paymentId: p.id },
      });
      return { ...p.toJSON(), documents: docs };
    })
  );
};

// Get payments by client with documents
export const getPaymentsByClient = async (clientId: string, companyId: string) => {
  const payments = await Payments.findAll({
    where: { clientId, companyId, isDeleted: false },
    include: [
      {
        model: Clients,
        as: "client",
        required: false,
        attributes: ["id", "businessName", "clientfirstName", "clientLastName"],
      },
    ],
    order: [["paymentDate", "DESC"]],
  });

  return await Promise.all(
    payments.map(async (p) => {
      const docs = await PaymentsDocuments.findAll({
        where: { paymentId: p.id },
      });
      return { ...p.toJSON(), documents: docs };
    })
  );
};

// Get payments by vendor with documents
export const getPaymentsByVendor = async (vendorId: string, companyId: string) => {
  const payments = await Payments.findAll({
    where: { vendorId, companyId, isDeleted: false },
    include: [
      {
        model: Vendor,
        as: "vendor",
        required: false,
        attributes: ["id", "companyName", "firstName", "lastName"],
      },
    ],
    order: [["paymentDate", "DESC"]],
  });

  return await Promise.all(
    payments.map(async (p) => {
      const docs = await PaymentsDocuments.findAll({
        where: { paymentId: p.id },
      });
      return { ...p.toJSON(), documents: docs };
    })
  );
};

// Get unpaid invoices for a client (for payment creation)
export const getUnpaidInvoices = async (clientId: string, companyId: string) => {
  return await Invoice.findAll({
    where: {
      clientId,
      companyId,
      isDeleted: false,
      status: { [Op.in]: ["Unpaid", "Partially Paid"] },
    },
    attributes: [
      "id",
      "invoiceNo",
      "invoiceDate",
      "total",
      "balance",
      "status",
    ],
    order: [["invoiceDate", "ASC"]],
  });
};

// Get unpaid purchase bills for a vendor (for payment creation)
export const getUnpaidPurchaseBills = async (vendorId: string, companyId: string) => {
  return await PurchaseBill.findAll({
    where: {
      vendorId,
      companyId,
      isDeleted: false,
      status: { [Op.in]: ["unpaid", "partially paid"] },
    },
    attributes: [
      "id",
      "purchaseBillNo",
      "purchaseBillDate",
      "total",
      "balance",
      "status",
    ],
    order: [["purchaseBillDate", "ASC"]],
  });
};

// Update payment with new document links
export const updatePayment = async (
  id: string,
  companyId: string,
  body: CreatePaymentInput,
  t: Transaction
) => {
  // Verify payment exists
  const existingPayment = await Payments.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!existingPayment) {
    throw new Error("Payment not found");
  }

  // Reverse previous document payments
  const oldDocs = await PaymentsDocuments.findAll({
    where: { paymentId: id },
    transaction: t,
  });

  for (const doc of oldDocs) {
    await updateDocumentBalance(
      doc.documentId,
      doc.documentType,
      doc.paymentValue,
      companyId,
      true,
      t
    );
  }

  // Delete old document links
  await PaymentsDocuments.destroy({
    where: { paymentId: id },
    transaction: t,
  });

  // Calculate new summary fields
  let amountUsedForPayments = 0;
  for (const doc of body.documents) {
    amountUsedForPayments += doc.paymentValue;
  }

  const amountInExcess = body.paymentAmount - amountUsedForPayments;

  // Validate total payment values
  if (amountUsedForPayments > body.paymentAmount) {
    throw new Error(
      `Total payment values (${amountUsedForPayments}) exceed payment amount (${body.paymentAmount})`
    );
  }

  // Apply new document payments
  for (const doc of body.documents) {
    await updateDocumentBalance(
      doc.documentId,
      doc.documentType,
      doc.paymentValue,
      companyId,
      false,
      t
    );
  }

  // Create new document links
  for (const doc of body.documents) {
    await PaymentsDocuments.create(
      {
        paymentId: id,
        documentId: doc.documentId,
        documentType: doc.documentType,
        paymentValue: parseFloat(doc.paymentValue.toFixed(2)),
      },
      { transaction: t, validate: true }
    );
  }

  // Update payment record
  await Payments.update(
    {
      paymentType: body.paymentType,
      clientId: body.clientId ?? null,
      vendorId: body.vendorId ?? null,
      paymentNo: body.paymentNo,
      paymentAmount: parseFloat(body.paymentAmount.toFixed(2)),
      paymentDate: body.paymentDate || existingPayment.paymentDate,
      referenceNo: body.referenceNo || null,
      method: body.method,
      bankCharges: body.bankCharges
        ? parseFloat(body.bankCharges.toFixed(2))
        : 0,
      memo: body.memo || null,
      amountReceived: parseFloat(body.paymentAmount.toFixed(2)),
      amountUsedForPayments: parseFloat(amountUsedForPayments.toFixed(2)),
      amountInExcess: parseFloat(amountInExcess.toFixed(2)),
    },
    {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    }
  );

  return true;
};

// Soft delete payment and reverse document balances
export const deletePayment = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  // Verify payment exists
  const payment = await Payments.findOne({
    where: { id, companyId, isDeleted: false },
    transaction: t,
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  // Reverse all document payments
  const docs = await PaymentsDocuments.findAll({
    where: { paymentId: id },
    transaction: t,
  });

  for (const doc of docs) {
    await updateDocumentBalance(
      doc.documentId,
      doc.documentType,
      doc.paymentValue,
      companyId,
      true,
      t
    );
  }

  // Delete document links
  await PaymentsDocuments.destroy({
    where: { paymentId: id },
    transaction: t,
  });

  // Soft delete payment
  const [affectedRows] = await Payments.update(
    { isActive: false, isDeleted: true, status: "Deleted" },
    { where: { id, companyId }, transaction: t }
  );

  return affectedRows > 0;
};

// Search payments with filters
export interface SearchPaymentFilters {
  companyId: string;
  paymentType?: string;
  clientId?: string;
  vendorId?: string;
  paymentNo?: string;
  method?: string;
  status?: string;
  paymentDateFrom?: Date;
  paymentDateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export const searchPayments = async (filters: SearchPaymentFilters) => {
  const whereConditions: any = {
    companyId: filters.companyId,
    isDeleted: false,
  };

  if (filters.paymentType) {
    whereConditions.paymentType = filters.paymentType;
  }

  if (filters.clientId) {
    whereConditions.clientId = filters.clientId;
  }

  if (filters.vendorId) {
    whereConditions.vendorId = filters.vendorId;
  }

  if (filters.paymentNo) {
    whereConditions.paymentNo = {
      [Op.like]: `%${filters.paymentNo}%`,
    };
  }

  if (filters.method) {
    whereConditions.method = filters.method;
  }

  if (filters.status) {
    whereConditions.status = filters.status;
  }

  if (filters.paymentDateFrom || filters.paymentDateTo) {
    whereConditions.paymentDate = {};
    if (filters.paymentDateFrom) {
      whereConditions.paymentDate[Op.gte] = filters.paymentDateFrom;
    }
    if (filters.paymentDateTo) {
      whereConditions.paymentDate[Op.lte] = filters.paymentDateTo;
    }
  }

  if (filters.minAmount || filters.maxAmount) {
    whereConditions.paymentAmount = {};
    if (filters.minAmount) {
      whereConditions.paymentAmount[Op.gte] = filters.minAmount;
    }
    if (filters.maxAmount) {
      whereConditions.paymentAmount[Op.lte] = filters.maxAmount;
    }
  }

  const payments = await Payments.findAll({
    where: whereConditions,
    include: [
      {
        model: Clients,
        as: "client",
        required: false,
        attributes: ["id", "businessName", "clientfirstName", "clientLastName"],
      },
      {
        model: Vendor,
        as: "vendor",
        required: false,
        attributes: ["id", "companyName", "firstName", "lastName"],
      },
    ],
    order: [["paymentDate", "DESC"]],
  });

  return await Promise.all(
    payments.map(async (p) => {
      const docs = await PaymentsDocuments.findAll({
        where: { paymentId: p.id },
      });
      return { ...p.toJSON(), documents: docs };
    })
  );
};

// Get payment statistics for dashboard
export const getPaymentStatistics = async (companyId: string) => {
  const totalReceived = await Payments.sum("paymentAmount", {
    where: {
      companyId,
      paymentType: { [Op.in]: ["Payment Received", "Advance Payment Received"] },
      isDeleted: false,
    },
  });

  const totalPaid = await Payments.sum("paymentAmount", {
    where: {
      companyId,
      paymentType: { [Op.in]: ["Payment Made", "Advance Payment Made"] },
      isDeleted: false,
    },
  });

  const pendingPayments = await Payments.count({
    where: {
      companyId,
      status: "Pending",
      isDeleted: false,
    },
  });

  return {
    totalReceived: totalReceived || 0,
    totalPaid: totalPaid || 0,
    netCashFlow: (totalReceived || 0) - (totalPaid || 0),
    pendingPayments,
  };
};
