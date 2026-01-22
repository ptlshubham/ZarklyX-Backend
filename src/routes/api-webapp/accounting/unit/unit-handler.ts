import { Op, Transaction } from "sequelize";
import { Unit } from "./unit-model";

//create a new unit
export async function createUnit(body: any,t: any) {
  return await Unit.create(
    body, { transaction: t }
  );
}

//get item unit by id
export const getActiveUnitsByCompany = async (companyId: string) => {
  return await Unit.findAll({
    where: { companyId, isActive: true, isDeleted: false },
    order: [["unitName", "ASC"]],
  });
}
//get single unit details by id
export const getUnitById = async (id: string, companyId: string) => {
  return await Unit.findOne({
    where: { id, companyId, isDeleted: false },
  });
}

//update unit
export const updateUnit = async (id: string, companyId: string, body: any, t:Transaction) => {
    return await Unit.update(
        body,
        { where:{ id, companyId, isDeleted: false }, transaction: t }
    );
};

//soft delete Unit
export const deactivateItemUnit = async (id: string, companyId: string, t: Transaction) => {
   return await Unit.update(
        { isActive:false, isDeleted: true },
       { where:{ id, companyId, isDeleted: false }, transaction: t }
    );
}

//activate influencer category
export const setActiveUnit = async (id: string, companyId: string, t:any) => {
    return await Unit.update(
        { isActive:true, isDeleted: false },
        { where:{ id, companyId, isDeleted: false }, transaction: t }
    );
};


//hard delete
export const deleteItemUnit = async (id: string, companyId: string, t:any) => {
  return await Unit.destroy(
    { where: { id, companyId }, transaction: t }
  );
}