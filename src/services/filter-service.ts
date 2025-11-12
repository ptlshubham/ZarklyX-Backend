import { Op, literal } from "sequelize";
// const userData = require("./userService");
let SETTING_TYPES = [
  "customDate",
  "applyDefaults",
  "checkDelete",
  "checkActive",
];

type settingsType = {
  customDate: string;
  applyDefaults: string;
  checkDelete: string;
  checkActive: string;
};

type check =
  | "string"
  | "boolean"
  | "number"
  | "date"
  | "array"
  | "function"
  | string;

const initFilters = (options: settingsType): any[] => {
  let init: any[] = [];
  //apply isactive filter
  if (options?.checkActive) {
    init.push({ active: 1 });
  }

  return init;
};

/**
 * @param {object} filterObj applied by user in front
 * @returns {array}
 */
exports.MakeFilter = (
  filterObj: any,
  settings: settingsType
): any[] | unknown => {
  try {
    let options = initFilters(settings);

    if (filterObj) {
      for (let key of Object.keys(filterObj)) {
        let check: check = typeof filterObj[key];
        if (filterObj[key] != null && typeof filterObj[key] == "object") {
          if (filterObj[key]?.type && filterObj[key]?.type == 'dateRange') {
            check = "dateRange";

          }
          if (filterObj[key]?.type && filterObj[key]?.type == 'dateTime') {
            check = "dateTime";

          }
          filterObj[key] = filterObj[key].value;
        }
        switch (check) {
          case "string":
            //handle keys with . in between
            if (key.indexOf(".") > -1) {
              options.push({
                [`$${key}$`]: { [Op.substring]: `%${filterObj[key]}%` },
              });
            } else {
              options.push({
                [key]: { [Op.substring]: `%${filterObj[key]}%` },
              });
            }
            break;
          case "boolean":
            options.push({
              [key]: filterObj[key],
            });
            break;

          case "date":
            if (settings && settings.customDate) {
              options.push({
                [Op.and]: [
                  literal(
                    `(CONVERT(DATE, ${settings.customDate}.${key})) = '${filterObj[key]}'`
                  ),
                ],
              });
            } else {
              options.push({
                [key]: new Date(filterObj[key]),
              });
            }

          case "array":
            break;
          case "dateRange":
            options.push({
              [key]: { [Op.between]: [filterObj[key][0], filterObj[key][1]] },
            });
            break;
          case 'dateTime':

            let temp = filterObj[key].split('T').join(' ');
            options.push({
              [key]: { [Op.substring]: `%${temp}%` },
            });
            break;
          case "number":
            if (key.indexOf(".") > -1) {
              options.push({
                [`$${key}$`]: { [Op.like]: `%${filterObj[key]}%` },
              });
            } else {
              options.push({
                [key]: filterObj[key],
              });
            }
            break;

          default:
            break;
        }
      }
      return options;
    }
    return [];
  } catch (error: unknown) {
    return error;
  }
};