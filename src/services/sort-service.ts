import { Sequelize } from "sequelize";

//get orderBy;
exports.MakeSort = (stringifiedSort: string, orderSetting: any) => {
  if (!stringifiedSort || stringifiedSort == "false") {
    return [["id", "DESC"]];
  }
  //parse sort object
  let sort = JSON.parse(stringifiedSort);
  let key = Object.keys(sort)[0];
  let ref = key.split(".");
  if (ref.length > 1) {
    return [Sequelize.literal(`'${key}' ${sort[key]}`)];
  }
  return [[key, sort[key]]];
};
