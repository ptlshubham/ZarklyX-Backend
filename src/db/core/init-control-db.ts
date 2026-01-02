import type { Sequelize } from "sequelize";

// Models for Web -app
import { User } from "../../routes/api-webapp/authentication/user/user-model";
import { Company } from "../../routes/api-webapp/company/company-model";
import { UserCompany, initUserCompanyModel } from "../../routes/api-webapp/company/user-company-model";
import { Otp } from "../../routes/api-webapp/otp/otp-model";
import { LoginHistory } from "../../routes/api-webapp/loginHistory/loginHistory-model";
import { Category } from "../../routes/api-webapp/superAdmin/generalSetup/category/category-model";
import { PremiumModule } from "../../routes/api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-model";
import { Clients } from "../../routes/api-webapp/agency/clients/clients-model";
import { BusinessType } from "../../routes/api-webapp/superAdmin/generalSetup/businessType/businessType-model";
import { BusinessSubcategory } from "../../routes/api-webapp/superAdmin/generalSetup/businessType/businessSubcategory-model";
import { ItTickets } from "../../routes/api-webapp/it-Management/it-Tickets/it-Tickets-model";
// import { Role } from "../../routes/api-webapp/roles/role-model";
// import { SubRole } from "../../routes/api-webapp/roles/subrole-model";
// Use a relative path to the route-local Google token model to avoid module alias issues
import { SocialToken } from "../../routes/api-webapp/agency/social-Integration/social-token.model";
import { Employee } from "../../routes/api-webapp/agency/employee/employee-model";

// import { Role } from "../../routes/api-webapp/roles/role-model";
// import { SubRole } from "../../routes/api-webapp/roles/subrole-model";
// Use a relative path to the route-local Google token model to avoid module alias issues
// import { GoogleToken } from "../../routes/api-webapp/agency/social-Integration/google/google-token.model";
export {
  User,
  Company,
  UserCompany,
  Otp,
  LoginHistory,
  Category,
  PremiumModule,
  Clients,
  BusinessType,
  BusinessSubcategory,
  SocialToken,
  Employee,
  ItTickets,
  // GoogleToken
};
export function initControlDB(sequelize: Sequelize) {
  // For web App
  // User.initModel(sequelize);
  User.initModel(sequelize);
  Company.initModel(sequelize);
  PremiumModule.initModel(sequelize);
  Category.initModel(sequelize);
  Clients.initModel(sequelize);
  Employee.initModel(sequelize);
  Otp.initModel(sequelize);
  LoginHistory.initModel(sequelize);
  ItTickets.initModel(sequelize);
  // Roles
  // Role.initModel(sequelize);
  // SubRole.initModel(sequelize);
  initUserCompanyModel(sequelize);
  SocialToken.initModel(sequelize);
  // Role.initModel(sequelize);
  // SubRole.initModel(sequelize);
  initUserCompanyModel(sequelize);
  BusinessType.initModel(sequelize);
  BusinessSubcategory.initModel(sequelize);
  // GoogleToken.initModel(sequelize); 
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

  /*** User <-> Employee */
  User.hasMany(Employee, {
    foreignKey: "userId",
    as: "employees",        // user.getEmployees()
  });
  Employee.belongsTo(User, {
    foreignKey: "userId",
    as: "user",             // employee.getUser()
  });

  /*** Company <-> Employee */
  Company.hasMany(Employee, {
    foreignKey: "companyId",
    as: "employees",        // company.getEmployees()
  });
  Employee.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",          // employee.getCompany()
  });

  /*** Employee <-> Employee (Self-referencing for reporting manager) */
  Employee.belongsTo(Employee, {
    foreignKey: "reportingManagerId",
    as: "reportingManager", // employee.getReportingManager()
  });
  Employee.hasMany(Employee, {
    foreignKey: "reportingManagerId",
    as: "subordinates",     // manager.getSubordinates()
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

  /*** User <-> LoginHistory */
  User.hasMany(LoginHistory, {
    foreignKey: "userId",
    as: "loginHistories",
  });
  LoginHistory.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  /*** User <-> ItTickets */
  User.hasMany(ItTickets, {
    foreignKey: "userId",
    as: "itTickets",
  });
  ItTickets.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  /*** Company <-> ItTickets */
  Company.hasMany(ItTickets, {
    foreignKey: "companyId",
    as: "itTickets",
  });
  ItTickets.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
  });


  // Role <-> SubRole
  // Role.hasMany(SubRole, { foreignKey: "roleId", as: "subRoles" });
  // SubRole.belongsTo(Role, { foreignKey: "roleId", as: "role" });

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
    LoginHistory,
    UserCompany,
    Category,
    PremiumModule,
    Clients,
    BusinessType,
    BusinessSubcategory,
    // Role,
    // SubRole,
    SocialToken
    ,    // LoginHistory
    Employee,
    ItTickets,
    // Role,
    // SubRole,
    // GoogleToken,
    // LoginHistory
  };
}
