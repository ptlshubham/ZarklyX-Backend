import { Op } from "sequelize";
// Update the import to match the actual export from settings-model
// import {Settings} from "../routes/api-app/settings/settings-model";
const { MakeFilter } = require("./filter-service");
const { MakeSort } = require("./sort-service");
const { MakeAttributes } = require("./attribute-service");

let RequestQuery = function (this: any) {
  this.info = {};
};

RequestQuery.prototype.add = function (info: any) {
  this.info = info;
};

let queryData = new (RequestQuery as any)();

//helper to make query
/**
 *
 * @param {obj} queryObject {page, limit, id, filter, sort, forExcel}
 * @returns {wholeQueryObject, modelOption, orderBy, orderBy, attributes, offset}
 */

// const addDriverDocuments = async (data: any, transaction: any) => {
//   return await Settings.create(data, { transaction });
// };
const handleCheckBoxAction = (modelOption:any, query:any)=>{

  if (query.excluded) {
    if (typeof query.excluded == 'string') {
      modelOption.push({ id: { [Op.not]: query.excluded } })
    } else {
      modelOption.push({ id: { [Op.notIn]: query.excluded } })
    }
  }
  if (query.included) {
    if (typeof query.included == 'string') {
      modelOption.push({ id: query.included })
    } else {
      modelOption.push({ id: { [Op.in]: query.included } })
    }
  }
  // return modelOption
}
// const MakeQuery = (obj: any) => {
//   let { query, Model, filterSetting, orderSetting } = obj;
//   const { page, limit, id, filters, sort, forExcel } = query;
//   let convertedLimit = Number(limit);
//   let offset = (page - 1) * convertedLimit;
//   let filterObj = filters ? JSON.parse(filters) : null;
//   let modelOption = MakeFilter(filterObj, filterSetting);
//   let orderBy = MakeSort(sort, orderSetting);
//   let attributes = MakeAttributes(Model);
//   handleCheckBoxAction(modelOption, query)

//   return {
//     ...query,
//     modelOption,
//     orderBy,
//     attributes,
//     offset,
//     limit: convertedLimit,
//   };
// };

const MakeQuery = (obj: any) => {
  let { query, Model, filterSetting, orderSetting } = obj;
  const { page, limit, id, filters, sort, forExcel } = query;
  let convertedLimit = Number(limit) || 10;
  let convertedPage = Number(page) || 1;
  let offset = (convertedPage - 1) * convertedLimit;
  let filterObj = filters ? JSON.parse(filters) : null;
  let modelOption = MakeFilter(filterObj, filterSetting);
  let orderBy = MakeSort(sort, orderSetting);
  let attributes = MakeAttributes(Model);
  handleCheckBoxAction(modelOption, query)

  return {
    ...query,
    modelOption,
    orderBy,
    attributes,
    offset,
    limit: convertedLimit,
  };
};

const MakeOptions = (obj: any) => {};

module.exports = {
  MakeQuery,
  MakeOptions,
  queryData,
};
