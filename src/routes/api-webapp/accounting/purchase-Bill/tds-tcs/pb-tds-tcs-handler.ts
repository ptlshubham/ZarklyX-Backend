import { Op, Transaction } from "sequelize";
import { PurchaseBillTdsTcs } from "./pb-tds-tcs-model";

// Create a new Purchase Bill TDS/TCS entry
export async function createPBTdsTcs(body: any, t: Transaction) {
  return await PurchaseBillTdsTcs.create(body, { transaction: t });
}

// Get all Purchase Bill TDS/TCS entries for a specific invoice
export const getTdsTcsByPBId = async (
  purchaseBillId: string,
  companyId: string
) => {
  return await PurchaseBillTdsTcs.findAll({
    where: { purchaseBillId, companyId },
    order: [["createdAt", "DESC"]],
  });
};

// Get all active Purchase Bill TDS/TCS entries by company
export const getActivePBTdsTcsByCompanyId = async (companyId: string) => {
  return await PurchaseBillTdsTcs.findAll({
    where: { companyId },
    order: [["taxName", "ASC"]],
  });
};

// Get single TDS/TCS entry by id
export const getTdsTcsById = async (id: string, companyId: string) => {
  return await PurchaseBillTdsTcs.findOne({
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
  return await PurchaseBillTdsTcs.update(body, {
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
  return await PurchaseBillTdsTcs.destroy({
    where: { id, companyId },
    transaction: t,
  });
};

// Bulk create TDS/TCS entries for an purchase bill
export const bulkCreateTdsTcs = async (
  entries: any[],
  t: Transaction
) => {
  return await PurchaseBillTdsTcs.bulkCreate(entries, { transaction: t });
};

// Delete all TDS/TCS entries for a specific purchase bill
export const deleteTdsTcsByPBId = async (
  purchaseBillId: string,
  companyId: string,
  t: Transaction
) => {
  return await PurchaseBillTdsTcs.destroy({
    where: { purchaseBillId, companyId },
    transaction: t,
  });
};
