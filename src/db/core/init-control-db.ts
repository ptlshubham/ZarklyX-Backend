import type { Sequelize } from "sequelize";

// Models for Web -app
import { User } from "../../routes/api-webapp/authentication/user/user-model";
import { Company } from "../../routes/api-webapp/company/company-model";
import { UserCompany ,initUserCompanyModel } from "../../routes/api-webapp/company/user-company-model";
import { Otp } from "../../routes/api-webapp/otp/otp-model";
import { Category, initCategoryModel } from "../../routes/api-webapp/superAdmin/generalSetup/category/category-model";
import { PremiumModule ,initPremiumModuleModel } from "../../routes/api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-model";
import { Clients } from "../../routes/api-webapp/agency/clients/clients-model";
import { BusinessType } from "../../routes/api-webapp/superAdmin/generalSetup/businessType/businessType-model";
import { BusinessSubcategory } from "../../routes/api-webapp/superAdmin/generalSetup/businessType/businessSubcategory-model";

export {
  User,
  Company,
  UserCompany,
  Otp,
  Category,
  PremiumModule,
  Clients,
  BusinessType,
  BusinessSubcategory,
  // LoginHistory,
};
export function initControlDB(sequelize: Sequelize) {
  // For web App
  // User.initModel(sequelize);
  User.initModel(sequelize);
  Company.initModel(sequelize);
  PremiumModule.initModel(sequelize);
  Category.initModel(sequelize);
  Clients.initModel(sequelize);  
  Otp.initModel(sequelize);  
  initUserCompanyModel(sequelize);
  BusinessType.initModel(sequelize);
  BusinessSubcategory.initModel(sequelize);
//  initCategoryModel(sequelize);
//  initPremiumModuleModel(sequelize);
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
//   User.hasMany(Otp, {
//     foreignKey: "userId",
//     as: "otps",
//   });
//   Otp.belongsTo(User, {
//     foreignKey: "userId",
//     as : "user"
//   });
 
// /*** clients <-> otp */
Clients.hasMany(Otp, {
  foreignKey: "clientId",
  as: "Otps",
  constraints: false,
});
Otp.belongsTo(Clients, {
  foreignKey: "clientId",
  as: "client",
  constraints: false,
});

 /*** User <-> Clients  */
  User.hasMany(Clients, {
    foreignKey: "userId",
    as: "clients",          // user.getClients()
  });
  Clients.belongsTo(User, {
    foreignKey: "userId",
    as: "user",             // client.getUser()
  });

  /*** Company <-> Clients  */
  Company.hasMany(Clients, {
    foreignKey: "companyId",
    as: "companyClients",   // company.getCompanyClients()
  });
  Clients.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",          // client.getCompany()
  });

   /*** BusinessType <-> BusinessSubcategory */
  BusinessType.hasMany(BusinessSubcategory, {
    foreignKey: "businessTypeId",
    as: "subcategories",
  });

  BusinessSubcategory.belongsTo(BusinessType, {
    foreignKey: "businessTypeId",
    as: "businessType",
  });


// User.hasMany(Otp, { foreignKey: "userId", as: "userOtps" });
// Otp.belongsTo(User, { foreignKey: "userId", as: "user" });

// Clients.hasMany(Otp, { foreignKey: "clientId", as: "clientOtps" });
// Otp.belongsTo(Clients, { foreignKey: "clientId", as: "client" });
// Clients.hasMany(Otp, { foreignKey: "clientId", as: "clientOtps" });
// Otp.belongsTo(Clients, { foreignKey: "clientId", as: "client" });

  return {
    User,
    Company,
    Otp,  
    UserCompany,
    Category,
    PremiumModule,
    Clients,
    BusinessType,
    BusinessSubcategory
,    // LoginHistory
  };
}
