import { Transaction, Op } from "sequelize";
import { BusinessType } from "./businessType-model";
import { BusinessSubcategory } from "./businessSubcategory-model";

const { MakeQuery } = require("../../../../../services/model-service");

// ---------- BusinessType CRUD ----------

export interface BusinessTypePayload {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export const addBusinessType = async (body: BusinessTypePayload, t: Transaction) => {
  return BusinessType.create(
    {
      name: body.name,
      description: body.description ?? null,
      isActive: body.isActive ?? true,
      isDeleted: false,
    } as any,
    { transaction: t }
  );
};

export const updateBusinessType = async (
  id: number,
  body: Partial<BusinessTypePayload>,
  t: Transaction
) => {
  return BusinessType.update(body, {
    where: { id },
    transaction: t,
  });
};

export const deleteBusinessTypeSoft = async (id: number, t: Transaction) => {
  return BusinessType.update(
    { isDeleted: true, isActive: false },
    { where: { id }, transaction: t }
  );
};

export const getBusinessTypeById = async (id: number) => {
  return BusinessType.findOne({
    where: { id, isDeleted: false },
  });
};

export const getAllBusinessTypes = (query: any) => {
  const { limit, offset, modelOption, orderBy, attributes, forExcel } = MakeQuery({
    query,
    Model: BusinessType,
  });

  const params: any = {
    where: {
      ...modelOption,
      isDeleted: false,
    },
    attributes,
    order: orderBy,
    raw: true,
  };

  if (!forExcel) {
    params.limit = limit;
    params.offset = offset;
  }

  return BusinessType.findAndCountAll(params);
};

// ---------- BusinessSubcategory CRUD ----------

export interface BusinessSubcategoryPayload {
  businessTypeId: number;
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export const addBusinessSubcategory = async (
  body: BusinessSubcategoryPayload,
  t: Transaction
) => {
  return BusinessSubcategory.create(
    {
      businessTypeId: body.businessTypeId,
      name: body.name,
      description: body.description ?? null,
      isActive: body.isActive ?? true,
      isDeleted: false,
    } as any,
    { transaction: t }
  );
};

export const updateBusinessSubcategory = async (
  id: number,
  body: Partial<BusinessSubcategoryPayload>,
  t: Transaction
) => {
  return BusinessSubcategory.update(body, {
    where: { id },
    transaction: t,
  });
};

export const deleteBusinessSubcategorySoft = async (id: number, t: Transaction) => {
  return BusinessSubcategory.update(
    { isDeleted: true, isActive: false },
    { where: { id }, transaction: t }
  );
};

export const getBusinessSubcategoryById = async (id: number) => {
  return BusinessSubcategory.findOne({
    where: { id, isDeleted: false },
  });
};

export const getAllBusinessSubcategories = (query: any) => {
  const { limit, offset, modelOption, orderBy, attributes, forExcel } = MakeQuery({
    query,
    Model: BusinessSubcategory,
  });

  const params: any = {
    where: {
      ...modelOption,
      isDeleted: false,
    },
    attributes,
    order: orderBy,
    raw: true,
  };

  if (!forExcel) {
    params.limit = limit;
    params.offset = offset;
  }

  return BusinessSubcategory.findAndCountAll(params);
};

 // get subcategories by businessTypeId (multiple selection)

export const getSubcategoriesByBusinessType = async (
  businessTypeId: number
) => {
  return BusinessSubcategory.findAll({
    where: {
      businessTypeId,
      isDeleted: false,
      isActive: true,
    },
    order: [["name", "ASC"]],
  });
};