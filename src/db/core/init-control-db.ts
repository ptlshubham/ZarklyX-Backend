import type { Sequelize } from "sequelize";

// Models for Web -app
import { User } from "../../routes/api-webapp/user/user-model";
import { Company } from "../../routes/api-webapp/company/company-model";
import { UserCompany } from "src/routes/api-webapp/company/user-company-model";
import { Otp } from "../../routes/api-webapp/otp/otp-model";
// import {LoginHistory } from "../../routes/api-webapp/loginHistory/loginHistory-model";

export {
  User,
  Company,
  // UserCompany,
  Otp,
  // LoginHistory,
};
export function initControlDB(sequelize: Sequelize) {
  // For web App
  User.initModel(sequelize);
  Company.initModel(sequelize);
  // UserCompany.initModel(sequelize);
  Otp.initModel(sequelize);
// LoginHistory.initModel(sequelize);


  // Relations and associations
  /***user <-> company */
  User.belongsTo(Company, {
    foreignKey: "companyId",
  });
  Company.hasMany(User, {
    foreignKey: "companyId",
  });
//  User.hasMany(UserCompany, {
//     foreignKey: "userId",
//   });
//   UserCompany.belongsTo(User, {
//     foreignKey: "userId",
//   });

  /***user <-> otp */
  User.hasMany(Otp, {
    foreignKey: "userId",
    as: "otps",
  });
  Otp.belongsTo(User, {
    foreignKey: "userId",
    as : "user"
  });

  return {
    User,
    Company,
    Otp,  
    // UserCompany,
    // LoginHistory
  };
}
