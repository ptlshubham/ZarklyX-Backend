// const { literal } = require("sequelize");

/**
 * @param {object} Model sequelize model instance
 */
exports.MakeAttributes = (Model: any) => {
    let attributes = Object.keys(Model.rawAttributes);
  
    // attributes.push(
    //   literal(
    //     `(SELECT tbl_user_master.employee_name FROM tbl_user_master WHERE tbl_user_master.id = ${Model.tableName}.createdBy)  AS createdBy_User, (SELECT tbl_user_master.user_name FROM tbl_user_master WHERE tbl_user_master.id = ${Model.tableName}.modifiedBy) AS modifiedBy_User`
    //   )
    // );
  
    return attributes;
  };
  