import { Op, Transaction } from "sequelize";
import { ItemCategory } from "./item-Category-model";
import fs from "fs";
import path from "path";

//create a new item category
export async function createItemCategory(body: any,t: any) {
  return await ItemCategory.create(
    body, { transaction: t }
  );
}

//get item category by id
export async function getActiveItemCategoriesByCompany(companyId: string) {
  return await ItemCategory.findAll({
    where: { companyId, isActive: true, isDeleted:false },
    order: [["categoryName", "ASC"]],
  });
}
//get single category details by id
export async function getItemCategoryById(id: string, companyId: string) {
  return await ItemCategory.findOne({
    where: { id, companyId ,isDeleted:false},
  });
}

//update category
export async function updateItemCategory(id: string, companyId: string, data: { categoryName?: string; isActive?: boolean },t: Transaction) {
   const [affectedRows] = await ItemCategory.update(data, {
    where: { id, companyId, isDeleted: false },
    transaction: t,
  });

  if (affectedRows === 0) return null;

  return await ItemCategory.findOne({
    where: { id, companyId },
    transaction: t,
  });

}

//hide category
export async function deactivateItemCategory(id: string, companyId: string, t: Transaction) {
   const [affectedRows] = await ItemCategory.update(
    { isActive: false },
    {
      where: { id, companyId, isDeleted: false },
      transaction: t,
    }
  );

  if (affectedRows === 0) return null;

  return await ItemCategory.findOne({
    where: { id, companyId },
    transaction: t,
  });
}

//soft delete
export async function deleteItemCategory(id:string,companyId:string,t:any){
  return await ItemCategory.update(
    { isDeleted: true, isActive: false },
    { where: { id, companyId },transaction:t}
  );
}