import { Op, Transaction } from "sequelize";
import { Payments, PaymentMethod, PaymentType } from "./payments-model";
import { Invoice } from "../invoice/invoice-model";
import { PurchaseBill } from "../purchase-Bill/purchase-bill-model";
import { PurchaseOrder } from "../purchaseOrder/purchase-order-model";
import { Clients } from "../../agency/clients/clients-model";
import { Vendor } from "../vendor/vendor-model";
import { PaymentsDocuments, DocumentType } from "./payments-documents-model";
import { addPaymentLedger, deleteLedgerByReference } from "../client-ledger/client-ledger-handler";

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

    const currentBalance = Number(invoice.balance ?? invoice.total ?? 0);
    const paymentVal = Number(paymentValue);
    const newBalance = isReversal
      ? currentBalance + paymentVal
      : currentBalance - paymentVal;

    // Validate payment value
    if (!isReversal && paymentVal > currentBalance) {
      throw new Error(
        `Payment value ${paymentVal} exceeds invoice balance ${currentBalance}`
      );
    }

    // Determine new status
    let newStatus = invoice.status;
    if (newBalance <= 0) {
      newStatus = "Paid";
    } else if (newBalance < (Number(invoice.total ?? 0))) {
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

    const currentBalance = Number(bill.balance ?? bill.total ?? 0);
    const paymentVal = Number(paymentValue);
    const newBalance = isReversal
      ? currentBalance + paymentVal
      : currentBalance - paymentVal;

    // Validate payment value
    if (!isReversal && paymentVal > currentBalance) {
      throw new Error(
        `Payment value ${paymentVal} exceeds bill balance ${currentBalance}`
      );
    }

    // Determine new status
    let newStatus = bill.status;
    if (newBalance <= 0) {
      newStatus = "Closed";
    } else if (newBalance < (Number(bill.total ?? 0))) {
      newStatus = "Partially Paid";
    } else {
      newStatus = "Open";
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

  // Normalize numeric inputs to avoid string concatenation issues
  const paymentAmountNum = Number(paymentAmount || 0);
  const bankChargesNum = bankCharges ? Number(bankCharges) : 0;

  // Calculate summary fields
  let amountUsedForPayments = 0;
  for (const doc of documents) {
    const paymentVal = Number(doc.paymentValue || 0);
    amountUsedForPayments += paymentVal;

    // Also normalize the doc.paymentValue so further usage is safe
    (doc as any).paymentValue = paymentVal;
  }

  const amountInExcess = paymentAmountNum - amountUsedForPayments;

  // Validate total payment values don't exceed payment amount
  if (amountUsedForPayments > paymentAmountNum) {
    throw new Error(
      `Total payment values (${amountUsedForPayments}) exceed payment amount (${paymentAmountNum})`
    );
  }

  // Process each document payment
  for (const doc of documents) {
    await updateDocumentBalance(
      doc.documentId,
      doc.documentType,
      Number(doc.paymentValue || 0),
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
      paymentAmount: parseFloat(paymentAmountNum.toFixed(2)),
      paymentDate: paymentDate || new Date(),
      referenceNo: referenceNo || null,
      method,
      bankCharges: bankChargesNum ? parseFloat(bankChargesNum.toFixed(2)) : 0,
      memo: memo || null,
      amountReceived: parseFloat(paymentAmountNum.toFixed(2)),
      amountUsedForPayments: parseFloat(amountUsedForPayments.toFixed(2)),
      amountInExcess: parseFloat(amountInExcess.toFixed(2)),
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
        paymentValue: parseFloat(Number(doc.paymentValue || 0).toFixed(2)),
        isActive: true,
        isDeleted: false,
      },
      { transaction: t, validate: true }
    );
  }

  // Add ledger entry for payment received (client payments only)
  if (
    (paymentType === "Payment Received" || paymentType === "Advance Payment Received") &&
    clientId
  ) {
    await addPaymentLedger(
      clientId,
      companyId,
      payment.id,
      payment.paymentDate,
      payment.paymentAmount,
      t
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
        attributes: ["id", "companyName", "name", "email"],
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
  try {
    const payments = await Payments.findAll({
      where: { companyId, isDeleted: false },
      order: [["paymentDate", "DESC"]],
      raw: false,
    });

    return await Promise.all(
      payments.map(async (p) => {
        try {
          // Fetch related documents and enrich with invoice details
          const docs = await PaymentsDocuments.findAll({
            where: { paymentId: p.id },
            raw: true,
          });

          const enrichedDocs = await Promise.all(
            docs.map(async (doc: any) => {
              let invoiceNo = null;
              let poNo = null;
              
              try {
                if (doc.documentType === "Invoice") {
                  const invoice = await Invoice.findByPk(doc.documentId, {
                    attributes: ["id", "invoiceNo"],
                    raw: true,
                  });
                  if (invoice) {
                    invoiceNo = invoice.invoiceNo;
                  }
                } else if (doc.documentType === "PurchaseOrder") {
                  const po = await PurchaseOrder.findByPk(doc.documentId, {
                    attributes: ["id", "poNo"],
                    raw: true,
                  });
                  if (po) {
                    poNo = po.poNo;
                  }
                } else if (doc.documentType === "PurchaseBill") {
                  const bill = await PurchaseBill.findByPk(doc.documentId, {
                    attributes: ["id", "invoiceNo", "poNo"],
                    raw: true,
                  });
                  if (bill) {
                    invoiceNo = bill.invoiceNo;
                    poNo = bill.poNo;
                  }
                }
              } catch (err) {
                console.error(`Error fetching document ${doc.documentId}:`, err);
              }
              
              return {
                ...doc,
                invoiceNo: invoiceNo || doc.documentId,
                poNo: poNo || null,
              };
            })
          );

          // Fetch client/vendor details separately if IDs exist
          let client = null;
          let vendor = null;

          if (p.clientId) {
            try {
              client = await Clients.findByPk(p.clientId, {
                attributes: ["id", "businessName", "clientfirstName", "clientLastName"],
                raw: true,
              });
            } catch (err) {
              console.warn(`Failed to fetch client ${p.clientId}:`, err);
            }
          }

          if (p.vendorId) {
            try {
              vendor = await Vendor.findByPk(p.vendorId, {
                attributes: ["id", "companyName", "name", "email"],
                raw: true,
              });
            } catch (err) {
              console.warn(`Failed to fetch vendor ${p.vendorId}:`, err);
            }
          }

          return {
            ...p.toJSON(),
            documents: enrichedDocs,
            client,
            vendor,
          };
        } catch (err) {
          console.error(`Error processing payment ${p.id}:`, err);
          return { ...p.toJSON(), documents: [], client: null, vendor: null };
        }
      })
    );
  } catch (err) {
    console.error("Error in getPaymentsByCompany:", err);
    throw err;
  }
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
        attributes: ["id", "companyName", "name", "email"],
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
      status: { [Op.in]: ["Open", "Partially Paid"] },
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
        isActive: true,
        isDeleted: false
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

  // Delete ledger entry for payment received (client payments only)
  if (
    (payment.paymentType === "Payment Received" ||
      payment.paymentType === "Advance Payment Received") &&
    payment.clientId
  ) {
    await deleteLedgerByReference("payment", id, t);
  }

  // Soft delete payment
  const [affectedRows] = await Payments.update(
    { isActive: false, isDeleted: true },
    { where: { id, companyId }, transaction: t }
  );

  return affectedRows > 0;
};

// Bulk delete payments
export const bulkDeletePayments = async (
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
      // Verify payment exists
      const payment = await Payments.findOne({
        where: { id, companyId, isDeleted: false },
        transaction: t,
      });

      if (!payment) {
        results.failed.push({ id, reason: "Payment not found" });
        continue;
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
      await Payments.update(
        { isActive: false, isDeleted: true },
        { where: { id, companyId }, transaction: t }
      );

      results.successful.push(id);
    } catch (error: any) {
      results.failed.push({ id, reason: error.message || "Unknown error" });
    }
  }

  return results;
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
        attributes: ["id", "companyName", "name", "email"],
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

// Get payments for an invoice
export const getPaymentsForInvoice = async (
  invoiceId: string,
  companyId: string
) => {
  return PaymentsDocuments.findAll({
    where: {
      documentId: invoiceId,
      documentType: "Invoice",
      isDeleted: false,
    },
    include: [
      {
        model: Payments,
        as: "payment",
        where: { companyId, isDeleted: false },
        required: false,
        attributes: ["id", "paymentNo", "paymentAmount", "paymentDate", "method", "referenceNo", "bankCharges", "memo"]
      },
    ],
  });
};

// Get invoices paid by a payment
export const getInvoicesForPayment = async (
  paymentId: string
) => {
  return PaymentsDocuments.findAll({
    where: {
      paymentId,
      documentType: "Invoice",
      isDeleted: false,
    },
    include: [{ model: Invoice }],
  });
};

// Get payments for a purchase bill
export const getPaymentsForPurchaseBill = async (
  purchaseBillId: string,
  companyId: string
) => {
  return PaymentsDocuments.findAll({
    where: {
      documentId: purchaseBillId,
      documentType: "PurchaseBill",
      isDeleted: false,
    },
    include: [
      {
        model: Payments,
        as: "payment",
        where: { companyId, isDeleted: false },
        required: true,
        attributes: ['id', 'paymentNo', 'paymentAmount', 'paymentDate', 'method', 'referenceNo', 'memo'],
      },
    ],
    attributes: ['id', 'paymentId', 'documentId', 'paymentValue', 'documentType'],
    raw: false,
  });
};

// Get purchase bills paid by a payment
export const getPurchaseBillsForPayment = async (
  paymentId: string
) => {
  return PaymentsDocuments.findAll({
    where: {
      paymentId,
      documentType: "PurchaseBill",
      isDeleted: false,
    },
    include: [{ model: PurchaseBill }],
  });
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

  return {
    totalReceived: totalReceived || 0,
    totalPaid: totalPaid || 0,
    netCashFlow: (totalReceived || 0) - (totalPaid || 0)
  };
};
