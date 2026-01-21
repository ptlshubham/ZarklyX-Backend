import { Op, Transaction } from "sequelize";
import { QuoteTdsTcs } from "./quote-tds-tcs-model";

// Create a new quote TDS/TCS entry
export async function createQuoteTdsTcs(body: any, t: Transaction) {
  return await QuoteTdsTcs.create(body, { transaction: t });
}

// Get all TDS/TCS entries for a specific quote
export const getTdsTcsByQuoteId = async ( quoteId: string, companyId: string) => {
  return await QuoteTdsTcs.findAll({
    where: { quoteId, companyId },
    order: [["createdAt", "DESC"]],
  });
};

// Get all active TDS/TCS entries by company
export const getActiveQuoteTdsTcsByCompany = async (companyId: string) => {
  return await QuoteTdsTcs.findAll({
    where: { companyId },
    order: [["taxName", "ASC"]],
  });
};

// Get single TDS/TCS entry by id
export const getQuoteTdsTcsById = async (id: string, companyId: string) => {
  return await QuoteTdsTcs.findOne({
    where: { id, companyId },
  });
};

// Update TDS/TCS entry
export const updateQuoteTdsTcs = async (id: string, companyId: string, body: any, t: Transaction) => {
  return await QuoteTdsTcs.update(body, {
    where: { id, companyId },
    transaction: t,
  });
};

// Delete TDS/TCS entry (hard delete)
export const deleteQuoteTdsTcs = async (id: string, companyId: string, t: Transaction) => {
  return await QuoteTdsTcs.destroy({
    where: { id, companyId },
    transaction: t,
  });
};

// Bulk create TDS/TCS entries for a quote
export const bulkCreateQuoteTdsTcs = async (entries: any[], t: Transaction) => {
  return await QuoteTdsTcs.bulkCreate(entries, { transaction: t });
};

// Delete all TDS/TCS entries for a specific quote
export const deleteTdsTcsByQuoteId = async (quoteId: string, companyId: string, t: Transaction) => {
  return await QuoteTdsTcs.destroy({
    where: { quoteId, companyId },
    transaction: t,
  });
};
