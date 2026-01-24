import { Op, Transaction } from "sequelize";
import { InvoiceTdsTcs } from "./invoice-tds-tcs-model";

// Create a new Invoice TDS/TCS entry
export async function createInvoiceTdsTcs(body: any, t: Transaction) {
  return await InvoiceTdsTcs.create(body, { transaction: t });
}

// Get all Invoice TDS/TCS entries for a specific invoice
export const getTdsTcsByInvoiceId = async (
  invoiceId: string,
  companyId: string
) => {
  return await InvoiceTdsTcs.findAll({
    where: { invoiceId, companyId },
    order: [["createdAt", "DESC"]],
  });
};

// Get all active Invoice TDS/TCS entries by company
export const getActiveInvoiceTdsTcsByCompany = async (companyId: string) => {
  return await InvoiceTdsTcs.findAll({
    where: { companyId },
    order: [["taxName", "ASC"]],
  });
};

// Get single TDS/TCS entry by id
export const getTdsTcsById = async (id: string, companyId: string) => {
  return await InvoiceTdsTcs.findOne({
    where: { id, companyId },
  });
};

// Update TDS/TCS entry
export const updateTdsTcs = async (
  id: string,
  companyId: string,
  body: any,
  t: Transaction
) => {
  return await InvoiceTdsTcs.update(body, {
    where: { id, companyId },
    transaction: t,
  });
};

// Delete TDS/TCS entry (hard delete)
export const deleteTdsTcs = async (
  id: string,
  companyId: string,
  t: Transaction
) => {
  return await InvoiceTdsTcs.destroy({
    where: { id, companyId },
    transaction: t,
  });
};

// Bulk create TDS/TCS entries for an invoice
export const bulkCreateTdsTcs = async (
  entries: any[],
  t: Transaction
) => {
  return await InvoiceTdsTcs.bulkCreate(entries, { transaction: t });
};

// Delete all TDS/TCS entries for a specific invoice
export const deleteTdsTcsByInvoiceId = async (
  invoiceId: string,
  companyId: string,
  t: Transaction
) => {
  return await InvoiceTdsTcs.destroy({
    where: { invoiceId, companyId },
    transaction: t,
  });
};
