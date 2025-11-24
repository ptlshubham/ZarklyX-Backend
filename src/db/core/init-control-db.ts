import type { Sequelize } from "sequelize";

// Models for Web -app
import { User } from "../../routes/api-webapp/user/user-model";
import { Company } from "../../routes/api-webapp/company/company-model";
import { UserCompany ,initUserCompanyModel } from "../../routes/api-webapp/company/user-company-model";
import { Otp } from "../../routes/api-webapp/otp/otp-model";
import { Category, initCategoryModel } from "../../routes/api-webapp/category/category-model";
import { PremiumModule ,initPremiumModuleModel} from "../../routes/api-webapp/premiumModule/premiumModule-model"; 

export {
  User,
  Company,
  UserCompany,
  Otp,
  Category,
  PremiumModule
  // LoginHistory,
};
export function initControlDB(sequelize: Sequelize) {
  // For web App
  User.initModel(sequelize);
  Company.initModel(sequelize);
 initUserCompanyModel(sequelize);
 initCategoryModel(sequelize);
 initPremiumModuleModel(sequelize);
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

  /***user <-> userCompany */
  User.hasMany(UserCompany, {
    foreignKey: "userId",
  });
  UserCompany.belongsTo(User, {
    foreignKey: "userId",
  });

  Company.hasMany(UserCompany, {
    foreignKey: "companyId",
  });
  UserCompany.belongsTo(Company, {
    foreignKey: "companyId",
  });

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
    UserCompany,
    Category,
    PremiumModule
,    // LoginHistory
  };
}
