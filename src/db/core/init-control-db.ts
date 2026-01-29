import type { Sequelize } from "sequelize";

// Models for Web -app
import { Role, initRoleModel } from "../../routes/api-webapp/roles/role-model";
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

import { InfluencerCategory } from "../../routes/api-webapp/superAdmin/influencer/category/influencerCategory-model";
import { Influencer } from "../../routes/api-webapp/influencer/influencer-model";
import { Industry } from "../../routes/api-webapp/superAdmin/influencer/industry/influencerIndustry-models";
import { Platform } from "../../routes/api-webapp/superAdmin/influencer/platform/influencerPlatform-model";
import { ItemCategory } from "../../routes/api-webapp/accounting/item-Category/item-Category-model";
import { Unit } from "../../routes/api-webapp/accounting/unit/unit-model";
import { Item } from "../../routes/api-webapp/accounting/item/item-model";
import { Vendor } from "../../routes/api-webapp/accounting/vendor/vendor-model";
import { Invoice } from "../../routes/api-webapp/accounting/invoice/invoice-model";
import { InvoiceItem } from "../../routes/api-webapp/accounting/invoice/invoice-item-model";
import { InvoiceTdsTcs } from "../../routes/api-webapp/accounting/invoice/tds-tcs/invoice-tds-tcs-model";
import { Quote } from "../../routes/api-webapp/accounting/quote/quote-model";
import { QuoteItem } from "../../routes/api-webapp/accounting/quote/quote-item-model";
import { QuoteTdsTcs } from "../../routes/api-webapp/accounting/quote/tds-tcs/quote-tds-tcs-model";
import { CreditNote } from "../../routes/api-webapp/accounting/credit-Note/credit-note-model";
import { CreditNoteItem } from "../../routes/api-webapp/accounting/credit-Note/credit-note-item-model";
import { DebitNote } from "../../routes/api-webapp/accounting/debtit-Note/debit-note-model";
import { DebitNoteItem } from "../../routes/api-webapp/accounting/debtit-Note/debit-note-item-model";
import { PurchaseBill } from "../../routes/api-webapp/accounting/purchase-Bill/purchase-bill-model";
import { PurchaseBillItem } from "../../routes/api-webapp/accounting/purchase-Bill/purcharse-bill-item-model";
import { PurchaseBillTdsTcs } from "../../routes/api-webapp/accounting/purchase-Bill/tds-tcs/pb-tds-tcs-model";
import { PurchaseOrder } from "../../routes/api-webapp/accounting/purchaseOrder/purchase-order-model";
import { PurchaseOrderItem } from "../../routes/api-webapp/accounting/purchaseOrder/purchase-order-item-model";
import { Payments } from "../../routes/api-webapp/accounting/payments/payments-model";
import { PaymentsDocuments } from "../../routes/api-webapp/accounting/payments/payments-documents-model";
import { AccountingDocument } from "../../routes/api-webapp/accounting/accounting-document-model";
import { Modules, initModulesModel } from "../../routes/api-webapp/superAdmin/modules/modules-model";
import { Permissions, initPermissionsModel } from "../../routes/api-webapp/superAdmin/permissions/permissions-model";
import { SubscriptionPlan, initSubscriptionPlanModel } from "../../routes/api-webapp/superAdmin/subscription-plan/subscription-plan-model";
import { SubscriptionPlanModule, initSubscriptionPlanModuleModel } from "../../routes/api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";
import { CompanyModule, initCompanyModuleModel } from "../../routes/api-webapp/company/company-module/company-module-model";
import { CompanySubscription, initCompanySubscriptionModel } from "../../routes/api-webapp/company/company-subscription/company-subscription-model";
import { CompanyPermission, initCompanyPermissionModel } from "../../routes/api-webapp/company/company-permission/company-permission-model";
import { SubscriptionPlanPermission, initSubscriptionPlanPermissionModel } from "../../routes/api-webapp/superAdmin/subscription-plan-permission/subscription-plan-permission-model";
import { RolePermissions, initRolePermissionsModel } from "../../routes/api-webapp/role-permissions/role-permissions-model";
import { UserPermissionOverrides, initUserPermissionOverridesModel } from "../../routes/api-webapp/user-permission-overrides/user-permission-overrides-model";
import { ZarklyXUser } from "../../routes/api-webapp/superAdmin/zarklyX-users/zarklyX-users-model";
import { ZarklyXRole } from "../../routes/api-webapp/superAdmin/zarklyX-roles/zarklyX-roles-model";
import { ZarklyXPermission } from "../../routes/api-webapp/superAdmin/zarklyX-permissions/zarklyX-permissions-model";
import { ZarklyXRolePermission } from "../../routes/api-webapp/superAdmin/zarklyX-role-permissions/zarklyX-role-permissions-model";
import { ZarklyXUserPermissionOverride } from "../../routes/api-webapp/superAdmin/zarklyX-user-permission-overrides/zarklyX-user-permission-overrides-model";

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
  InfluencerCategory,
  Influencer,
  Industry,
  Platform,
  ItemCategory,
  Unit,
  Item,
  Vendor,
  Invoice,
  InvoiceItem,
  InvoiceTdsTcs,
  Quote,
  QuoteItem,
  QuoteTdsTcs,
  CreditNote,
  CreditNoteItem,
  DebitNote,
  DebitNoteItem,
  PurchaseBill,
  PurchaseBillItem,
  PurchaseBillTdsTcs,
  PurchaseOrder,
  PurchaseOrderItem,
  Payments,
  PaymentsDocuments,
  AccountingDocument,
  Modules,
  Permissions,
  SubscriptionPlan,
  SubscriptionPlanModule,
  SubscriptionPlanPermission,
  CompanyModule,
  CompanySubscription,
  CompanyPermission,
  Role,
  RolePermissions,
  UserPermissionOverrides,
  ZarklyXUser,
  ZarklyXRole,
  ZarklyXPermission,
  ZarklyXRolePermission,
  ZarklyXUserPermissionOverride,
};
export function initControlDB(sequelize: Sequelize) {
  // For web App
  // User.initModel(sequelize);
  Company.initModel(sequelize);
  initRoleModel(sequelize);
  User.initModel(sequelize);
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
  InfluencerCategory.initModel(sequelize);
  Influencer.initModel(sequelize);
  Industry.initModel(sequelize);
  Platform.initModel(sequelize);

  ItemCategory.initModel(sequelize);
  Unit.initModel(sequelize);
  Item.initModel(sequelize);
  Vendor.initModel(sequelize);
  Invoice.initModel(sequelize);
  InvoiceItem.initModel(sequelize);
  InvoiceTdsTcs.initModel(sequelize);
  Quote.initModel(sequelize);
  QuoteItem.initModel(sequelize);
  QuoteTdsTcs.initModel(sequelize);
  CreditNote.initModel(sequelize);
  CreditNoteItem.initModel(sequelize);
  DebitNote.initModel(sequelize);
  DebitNoteItem.initModel(sequelize);
  PurchaseBill.initModel(sequelize);
  PurchaseBillItem.initModel(sequelize);
  PurchaseBillTdsTcs.initModel(sequelize);
  PurchaseOrder.initModel(sequelize);
  PurchaseOrderItem.initModel(sequelize);
  Payments.initModel(sequelize);
  PaymentsDocuments.initModel(sequelize);
  AccountingDocument.initModel(sequelize);
  initModulesModel(sequelize);
  initPermissionsModel(sequelize);
  initSubscriptionPlanModel(sequelize);
  initSubscriptionPlanModuleModel(sequelize);
  initSubscriptionPlanPermissionModel(sequelize);
  initCompanyModuleModel(sequelize);
  initCompanySubscriptionModel(sequelize);
  initCompanyPermissionModel(sequelize);
  initRolePermissionsModel(sequelize);
  initUserPermissionOverridesModel(sequelize);
  ZarklyXRole.initModel(sequelize);
  ZarklyXPermission.initModel(sequelize);
  ZarklyXUser.initModel(sequelize);
  ZarklyXRolePermission.initModel(sequelize);
  ZarklyXUserPermissionOverride.initModel(sequelize);


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

  /*** Company <-> Unit */
  Company.hasMany(Unit, {
    foreignKey: "companyId",
    as: "units",
  });
  Unit.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
  });

  /*** Company <-> ItemCategory */
  Company.hasMany(ItemCategory, {
    foreignKey: "companyId",
    as: "itemCategories",
  });
  ItemCategory.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
  });

  /*** Company <-> Item */
  Company.hasMany(Item, {
    foreignKey: "companyId",
    as: "items",
  });
  Item.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
  });

  /*** Unit <-> Item */
  Unit.hasMany(Item, {
    foreignKey: "unitId",
    as: "items",
  });
  Item.belongsTo(Unit, {
    foreignKey: "unitId",
    as: "unit",
  });

  /*** Company <-> Vendor */
  Company.hasMany(Vendor, {
    foreignKey: "companyId",
    as: "vendors",
  });
  Vendor.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
  });

  /*** Company <-> Invoice */
  Company.hasMany(Invoice, {
    foreignKey: "companyId",
    as: "invoices",
    constraints: false,
  });
  Invoice.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
    constraints: false,
  });

  /*** Clients <-> Invoice */
  Clients.hasMany(Invoice, {
    foreignKey: "clientId",
    as: "invoices",
    constraints: false,
  });
  Invoice.belongsTo(Clients, {
    foreignKey: "clientId",
    as: "client",
    constraints: false,
  });

  /*** Invoice <-> Item (Many-to-Many through InvoiceItem) */
  Invoice.belongsToMany(Item, {
    through: InvoiceItem,
    foreignKey: "invoiceId",
    otherKey: "itemId",
    as: "items",
  });
  Item.belongsToMany(Invoice, {
    through: InvoiceItem,
    foreignKey: "itemId",
    otherKey: "invoiceId",
    as: "invoices",
  });

  /*** Invoice <-> InvoiceItem */
  Invoice.hasMany(InvoiceItem, {
    foreignKey: "invoiceId",
    as: "invoiceItems",
  });
  InvoiceItem.belongsTo(Invoice, {
    foreignKey: "invoiceId",
    as: "invoice",
  });

  /*** Item <-> InvoiceItem */
  Item.hasMany(InvoiceItem, {
    foreignKey: "itemId",
    as: "invoiceItems",
  });
  InvoiceItem.belongsTo(Item, {
    foreignKey: "itemId",
    as: "item",
  });

  /*** Invoice <-> TdsTcs (One-to-Many) */
  Invoice.hasMany(InvoiceTdsTcs, {
    foreignKey: "invoiceId",
    as: "tdsTcsEntries",
  });
  InvoiceTdsTcs.belongsTo(Invoice, {
    foreignKey: "invoiceId",
    as: "invoice",
  });

  /*** Quote <-> Company */
  Company.hasMany(Quote, {
    foreignKey: "companyId",
    as: "quotes",
    constraints: false,
  });
  Quote.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
    constraints: false,
  });

  /*** Quote <-> Clients */
  Clients.hasMany(Quote, {
    foreignKey: "clientId",
    as: "quotes",
    constraints: false,
  });
  Quote.belongsTo(Clients, {
    foreignKey: "clientId",
    as: "client",
    constraints: false,
  });

  /*** Quote <-> Item (Many-to-Many through QuoteItem) */
  Quote.belongsToMany(Item, {
    through: QuoteItem,
    foreignKey: "quoteId",
    otherKey: "itemId",
    as: "items",
  });
  Item.belongsToMany(Quote, {
    through: QuoteItem,
    foreignKey: "itemId",
    otherKey: "quoteId",
    as: "quotes",
  });

  /*** Quote <-> QuoteItem */
  Quote.hasMany(QuoteItem, {
    foreignKey: "quoteId",
    as: "quoteItems",
  });
  QuoteItem.belongsTo(Quote, {
    foreignKey: "quoteId",
    as: "quote",
  });

  /*** Item <-> QuoteItem */
  Item.hasMany(QuoteItem, {
    foreignKey: "itemId",
    as: "quoteItems",
  });
  QuoteItem.belongsTo(Item, {
    foreignKey: "itemId",
    as: "item",
  });

  /*** Quote <-> QuoteTdsTcs (One-to-Many) */
  Quote.hasMany(QuoteTdsTcs, {
    foreignKey: "quoteId",
    as: "tdsTcsEntries",
  });
  QuoteTdsTcs.belongsTo(Quote, {
    foreignKey: "quoteId",
    as: "quote",
  });

  /*** CreditNote <-> Company */
  Company.hasMany(CreditNote, {
    foreignKey: "companyId",
    as: "creditNotes",
    constraints: false,
  });
  CreditNote.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
    constraints: false,
  });

  /*** CreditNote <-> Clients */
  Clients.hasMany(CreditNote, {
    foreignKey: "clientId",
    as: "creditNotes",
    constraints: false,
  });
  CreditNote.belongsTo(Clients, {
    foreignKey: "clientId",
    as: "client",
    constraints: false,
  });

  /*** CreditNote <-> Invoice */
  Invoice.hasMany(CreditNote, {
    foreignKey: "invoiceId",
    as: "creditNotes",
    constraints: false,
  });
  CreditNote.belongsTo(Invoice, {
    foreignKey: "invoiceId",
    as: "invoice",
    constraints: false,
  });

  /*** CreditNote <-> Item (Many-to-Many through CreditNoteItem) */
  CreditNote.belongsToMany(Item, {
    through: CreditNoteItem,
    foreignKey: "creditNoteId",
    otherKey: "itemId",
    as: "items",
  });
  Item.belongsToMany(CreditNote, {
    through: CreditNoteItem,
    foreignKey: "itemId",
    otherKey: "creditNoteId",
    as: "creditNotes",
  });

  /*** CreditNote <-> CreditNoteItem */
  CreditNote.hasMany(CreditNoteItem, {
    foreignKey: "creditNoteId",
    as: "creditNoteItems",
  });
  CreditNoteItem.belongsTo(CreditNote, {
    foreignKey: "creditNoteId",
    as: "creditNote",
  });

  /*** Item <-> CreditNoteItem */
  Item.hasMany(CreditNoteItem, {
    foreignKey: "itemId",
    as: "creditNoteItems",
  });
  CreditNoteItem.belongsTo(Item, {
    foreignKey: "itemId",
    as: "item",
  });

  /*** PurchaseBill <-> Company */
  Company.hasMany(PurchaseBill, {
    foreignKey: "companyId",
    as: "purchaseBills",
    constraints: false,
  });
  PurchaseBill.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
    constraints: false,
  });

  /*** PurchaseBill <-> Vendor */
  Vendor.hasMany(PurchaseBill, {
    foreignKey: "vendorId",
    as: "purchaseBills",
    constraints: false,
  });
  PurchaseBill.belongsTo(Vendor, {
    foreignKey: "vendorId",
    as: "vendor",
    constraints: false,
  });

  /*** PurchaseBill <-> Item (Many-to-Many through PurchaseBillItem) */
  PurchaseBill.belongsToMany(Item, {
    through: PurchaseBillItem,
    foreignKey: "purchaseBillId",
    otherKey: "itemId",
    as: "items",
  });
  Item.belongsToMany(PurchaseBill, {
    through: PurchaseBillItem,
    foreignKey: "itemId",
    otherKey: "purchaseBillId",
    as: "purchaseBills",
  });

  /*** PurchaseBill <-> PurchaseBillItem */
  PurchaseBill.hasMany(PurchaseBillItem, {
    foreignKey: "purchaseBillId",
    as: "purchaseBillItems",
  });
  PurchaseBillItem.belongsTo(PurchaseBill, {
    foreignKey: "purchaseBillId",
    as: "purchaseBill",
  });

  /*** Item <-> PurchaseBillItem */
  Item.hasMany(PurchaseBillItem, {
    foreignKey: "itemId",
    as: "purchaseBillItems",
  });
  PurchaseBillItem.belongsTo(Item, {
    foreignKey: "itemId",
    as: "item",
  });

  /*** PurchaseBill <-> PurchaseBillTdsTcs (One-to-Many) */
  PurchaseBill.hasMany(PurchaseBillTdsTcs, {
    foreignKey: "purchaseBillId",
    as: "tdsTcsEntries",
  });
  PurchaseBillTdsTcs.belongsTo(PurchaseBill, {
    foreignKey: "purchaseBillId",
    as: "purchaseBill",
  });

  /*** PurchaseOrder <-> Company */
  Company.hasMany(PurchaseOrder, {
    foreignKey: "companyId",
    as: "purchaseOrders",
    constraints: false,
  });
  PurchaseOrder.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
    constraints: false,
  });

  /*** PurchaseOrder <-> Vendor */
  Vendor.hasMany(PurchaseOrder, {
    foreignKey: "vendorId",
    as: "purchaseOrders",
    constraints: false,
  });
  PurchaseOrder.belongsTo(Vendor, {
    foreignKey: "vendorId",
    as: "vendor",
    constraints: false,
  });

  /*** PurchaseOrder <-> Unit */
  Unit.hasMany(PurchaseOrder, {
    foreignKey: "unitId",
    as: "purchaseOrders",
    constraints: false,
  });
  PurchaseOrder.belongsTo(Unit, {
    foreignKey: "unitId",
    as: "unit",
    constraints: false,
  });

  /*** PurchaseOrder <-> Item (Many-to-Many through PurchaseOrderItem) */
  PurchaseOrder.belongsToMany(Item, {
    through: PurchaseOrderItem,
    foreignKey: "poId",
    otherKey: "itemId",
    as: "items",
  });
  Item.belongsToMany(PurchaseOrder, {
    through: PurchaseOrderItem,
    foreignKey: "itemId",
    otherKey: "poId",
    as: "purchaseOrders",
  });

  /*** PurchaseOrder <-> PurchaseOrderItem */
  PurchaseOrder.hasMany(PurchaseOrderItem, {
    foreignKey: "poId",
    as: "purchaseOrderItems",
  });
  PurchaseOrderItem.belongsTo(PurchaseOrder, {
    foreignKey: "poId",
    as: "purchaseOrder",
  });

  /*** Item <-> PurchaseOrderItem */
  Item.hasMany(PurchaseOrderItem, {
    foreignKey: "itemId",
    as: "purchaseOrderItems",
  });
  PurchaseOrderItem.belongsTo(Item, {
    foreignKey: "itemId",
    as: "item",
  });

  /*** Unit <-> PurchaseOrderItem */
  Unit.hasMany(PurchaseOrderItem, {
    foreignKey: "unitId",
    as: "purchaseOrderItems",
  });
  PurchaseOrderItem.belongsTo(Unit, {
    foreignKey: "unitId",
    as: "unit",
  });

  /*** Payments <-> Company */
  Company.hasMany(Payments, {
    foreignKey: "companyId",
    as: "payments",
    constraints: false,
  });
  Payments.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company",
    constraints: false,
  });

  /*** Payments <-> Clients */
  Clients.hasMany(Payments, {
    foreignKey: "clientId",
    as: "payments",
    constraints: false,
  });
  Payments.belongsTo(Clients, {
    foreignKey: "clientId",
    as: "client",
    constraints: false,
  });

  /*** Payments <-> Vendor */
  Vendor.hasMany(Payments, {
    foreignKey: "vendorId",
    as: "payments",
    constraints: false,
  });
  Payments.belongsTo(Vendor, {
    foreignKey: "vendorId",
    as: "vendor",
    constraints: false,
  });

  /*** Payments <-> Invoice */
  Invoice.hasMany(Payments, {
    foreignKey: "invoiceId",
    as: "payments",
    constraints: false,
  });
  Payments.belongsTo(Invoice, {
    foreignKey: "invoiceId",
    as: "invoice",
    constraints: false,
  });

  /*** Payments <-> PurchaseBill */
  PurchaseBill.hasMany(Payments, {
    foreignKey: "purchaseBillId",
    as: "payments",
    constraints: false,
  });
  Payments.belongsTo(PurchaseBill, {
    foreignKey: "purchaseBillId",
    as: "purchaseBill",
    constraints: false,
  });

  // Payments <-> PaymentsDocuments
  Payments.hasMany(PaymentsDocuments, {
    foreignKey: "paymentId",
    as: "documents",
  });
  PaymentsDocuments.belongsTo(Payments, {
    foreignKey: "paymentId",
    as: "payment",
  });

  // Invoice <-> PaymentsDocuments
  Invoice.hasMany(PaymentsDocuments, {
    foreignKey: "documentId",
    as: "paymentDocuments",
    constraints: false,
    scope: { documentType: "Invoice" },
  });
  PaymentsDocuments.belongsTo(Invoice, {
    foreignKey: "documentId",
    as: "invoice",
    constraints: false,
  });

  // PurchaseBill <-> PaymentsDocuments
  PurchaseBill.hasMany(PaymentsDocuments, {
    foreignKey: "documentId",
    as: "paymentDocuments",
    constraints: false,
    scope: { documentType: "PurchaseBill" },
  });
  PaymentsDocuments.belongsTo(PurchaseBill, {
    foreignKey: "documentId",
    as: "purchaseBill",
    constraints: false,
  });

    /*** DebitNote <-> Company */
    Company.hasMany(DebitNote, {
      foreignKey: "companyId",
      as: "debitNotes",
      constraints: false,
    });
    DebitNote.belongsTo(Company, {
      foreignKey: "companyId",
      as: "company",
      constraints: false,
    });

    /*** DebitNote <-> Clients */
    Clients.hasMany(DebitNote, {
      foreignKey: "clientId",
      as: "debitNotes",
      constraints: false,
    });
    DebitNote.belongsTo(Clients, {
      foreignKey: "clientId",
      as: "client",
      constraints: false,
    });

    /*** DebitNote <-> Vendor */
    Vendor.hasMany(DebitNote, {
      foreignKey: "vendorId",
      as: "debitNotes",
      constraints: false,
    });
    DebitNote.belongsTo(Vendor, {
      foreignKey: "vendorId",
      as: "vendor",
      constraints: false,
    });

    /*** DebitNote <-> Invoice */
    Invoice.hasMany(DebitNote, {
      foreignKey: "invoiceId",
      as: "debitNotes",
      constraints: false,
    });
    DebitNote.belongsTo(Invoice, {
      foreignKey: "invoiceId",
      as: "invoice",
      constraints: false,
    });

    /*** DebitNote <-> PurchaseBill */
    PurchaseBill.hasMany(DebitNote, {
      foreignKey: "purchaseBillId",
      as: "debitNotes",
      constraints: false,
    });
    DebitNote.belongsTo(PurchaseBill, {
      foreignKey: "purchaseBillId",
      as: "purchaseBill",
      constraints: false,
    });

    /*** DebitNote <-> Item (Many-to-Many through DebitNoteItem) */
    DebitNote.belongsToMany(Item, {
      through: DebitNoteItem,
      foreignKey: "debitNoteId",
      otherKey: "itemId",
      as: "items",
    });
    Item.belongsToMany(DebitNote, {
      through: DebitNoteItem,
      foreignKey: "itemId",
      otherKey: "debitNoteId",
      as: "debitNotes",
    });

    /*** DebitNote <-> DebitNoteItem */
    DebitNote.hasMany(DebitNoteItem, {
      foreignKey: "debitNoteId",
      as: "debitNoteItems",
    });
    DebitNoteItem.belongsTo(DebitNote, {
      foreignKey: "debitNoteId",
      as: "debitNote",
    });

    /*** Item <-> DebitNoteItem */
    Item.hasMany(DebitNoteItem, {
      foreignKey: "itemId",
      as: "debitNoteItems",
    });
    DebitNoteItem.belongsTo(Item, {
      foreignKey: "itemId",
      as: "item",
    });

  /*** InfluencerCategory <-> Influencer (Many-to-Many) */
  InfluencerCategory.belongsToMany(Influencer, {
    through: 'influencer_category_mapping',
    foreignKey: "categoryId",
    otherKey: "influencerId",
    as: "influencers",
  });
  Influencer.belongsToMany(InfluencerCategory, {
    through: 'influencer_category_mapping',
    foreignKey: "influencerId",
    otherKey: "categoryId",
    as: "categories",
  });

  /*** Industry <-> Influencer (Many-to-Many) */
  Industry.belongsToMany(Influencer, {
    through: 'influencer_industry_mapping',
    foreignKey: "industryId",
    otherKey: "influencerId",
    as: "influencers",
  });
  Influencer.belongsToMany(Industry, {
    through: 'influencer_industry_mapping',
    foreignKey: "influencerId",
    otherKey: "industryId",
    as: "industries",
  });

  /*** Platform <-> Influencer (Many-to-Many) */
  Platform.belongsToMany(Influencer, {
    through: 'influencer_platform_mapping',
    foreignKey: "platformId",
    otherKey: "influencerId",
    as: "influencers",
  });
  Influencer.belongsToMany(Platform, {
    through: 'influencer_platform_mapping',
    foreignKey: "influencerId",
    otherKey: "platformId",
    as: "platforms",
  });

  // Permissions <-> Modules association
  // Each permission belongs to a module (moduleId foreign key)
  Permissions.belongsTo(Modules, {
    foreignKey: "moduleId",
    as: "module"
  });
  // Each module has many permissions
  Modules.hasMany(Permissions, {
    foreignKey: "moduleId",
    as: "permissions"
  });

  /*** SubscriptionPlan <-> SubscriptionPlanModule */
  SubscriptionPlan.hasMany(SubscriptionPlanModule, {
    foreignKey: "subscriptionPlanId",
    as: "planModules"
  });
  SubscriptionPlanModule.belongsTo(SubscriptionPlan, {
    foreignKey: "subscriptionPlanId",
    as: "subscriptionPlan"
  });

  /*** Modules <-> SubscriptionPlanModule */
  Modules.hasMany(SubscriptionPlanModule, {
    foreignKey: "moduleId",
    as: "planModules"
  });
  SubscriptionPlanModule.belongsTo(Modules, {
    foreignKey: "moduleId",
    as: "module"
  });

  /*** SubscriptionPlan <-> SubscriptionPlanPermission */
  SubscriptionPlan.hasMany(SubscriptionPlanPermission, {
    foreignKey: "subscriptionPlanId",
    as: "planPermissions"
  });
  SubscriptionPlanPermission.belongsTo(SubscriptionPlan, {
    foreignKey: "subscriptionPlanId",
    as: "subscriptionPlan"
  });

  /*** Permissions <-> SubscriptionPlanPermission */
  Permissions.hasMany(SubscriptionPlanPermission, {
    foreignKey: "permissionId",
    as: "planPermissions"
  });
  SubscriptionPlanPermission.belongsTo(Permissions, {
    foreignKey: "permissionId",
    as: "permission"
  });

  /*** Company <-> CompanyModule */
  Company.hasMany(CompanyModule, {
    foreignKey: "companyId",
    as: "companyModules"
  });
  CompanyModule.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company"
  });

  /*** Modules <-> CompanyModule */
  Modules.hasMany(CompanyModule, {
    foreignKey: "moduleId",
    as: "companyModules"
  });
  CompanyModule.belongsTo(Modules, {
    foreignKey: "moduleId",
    as: "module"
  });

  /*** Company <-> CompanySubscription */
  Company.hasMany(CompanySubscription, {
    foreignKey: "companyId",
    as: "subscriptions"
  });
  CompanySubscription.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company"
  });

  /*** SubscriptionPlan <-> CompanySubscription */
  SubscriptionPlan.hasMany(CompanySubscription, {
    foreignKey: "subscriptionPlanId",
    as: "companySubscriptions"
  });
  CompanySubscription.belongsTo(SubscriptionPlan, {
    foreignKey: "subscriptionPlanId",
    as: "subscriptionPlan"
  });

  /*** Company <-> CompanyPermission */
  Company.hasMany(CompanyPermission, {
    foreignKey: "companyId",
    as: "companyPermissions"
  });
  CompanyPermission.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company"
  });

  /*** Permissions <-> CompanyPermission */
  Permissions.hasMany(CompanyPermission, {
    foreignKey: "permissionId",
    as: "companyPermissions"
  });
  CompanyPermission.belongsTo(Permissions, {
    foreignKey: "permissionId",
    as: "permission"
  });

  /*** Company <-> Role (for company-scoped roles) */
  Company.hasMany(Role, {
    foreignKey: "companyId",
    as: "customRoles"
  });
  Role.belongsTo(Company, {
    foreignKey: "companyId",
    as: "company"
  });

  /*** User <-> Role */
  Role.hasMany(User, {
    foreignKey: "roleId",
    as: "users"
  });
  User.belongsTo(Role, {
    foreignKey: "roleId",
    as: "role"
  });

  /*** Role <-> RolePermissions */
  Role.hasMany(RolePermissions, {
    foreignKey: "roleId",
    as: "rolePermissions",
    onDelete: "CASCADE",
    hooks: true
  });
  RolePermissions.belongsTo(Role, {
    foreignKey: "roleId",
    as: "role"
  });

  /*** Permissions <-> RolePermissions */
  Permissions.hasMany(RolePermissions, {
    foreignKey: "permissionId",
    as: "rolePermissions",
    onDelete: "CASCADE",
    hooks: true
  });
  RolePermissions.belongsTo(Permissions, {
    foreignKey: "permissionId",
    as: "permission"
  });

  /*** User <-> UserPermissionOverrides */
  User.hasMany(UserPermissionOverrides, {
    foreignKey: "userId",
    as: "permissionOverrides",
    onDelete: "CASCADE",
    hooks: true
  });
  UserPermissionOverrides.belongsTo(User, {
    foreignKey: "userId",
    as: "user"
  });

  /*** Permissions <-> UserPermissionOverrides */
  Permissions.hasMany(UserPermissionOverrides, {
    foreignKey: "permissionId",
    as: "userOverrides",
    onDelete: "CASCADE",
    hooks: true
  });
  UserPermissionOverrides.belongsTo(Permissions, {
    foreignKey: "permissionId",
    as: "permission"
  });

  /*** User <-> UserPermissionOverrides (grantedBy self-reference) */
  User.hasMany(UserPermissionOverrides, {
    foreignKey: "grantedByUserId",
    as: "grantedOverrides"
  });
  UserPermissionOverrides.belongsTo(User, {
    foreignKey: "grantedByUserId",
    as: "grantedBy"
  });

  // ============================================================
  // ZarklyX RBAC Associations (Platform Admin System)
  // ============================================================
  
  // ZarklyXUser <-> ZarklyXRole
  ZarklyXUser.belongsTo(ZarklyXRole, {
    foreignKey: "roleId",
    as: "role",
  });
  ZarklyXRole.hasMany(ZarklyXUser, {
    foreignKey: "roleId",
    as: "users",
  });

  // ZarklyXUser <-> ZarklyXUserPermissionOverride
  ZarklyXUser.hasMany(ZarklyXUserPermissionOverride, {
    foreignKey: "userId",
    as: "permissionOverrides",
  });
  ZarklyXUserPermissionOverride.belongsTo(ZarklyXUser, {
    foreignKey: "userId",
    as: "user",
  });
  ZarklyXUserPermissionOverride.belongsTo(ZarklyXUser, {
    foreignKey: "grantedByUserId",
    as: "grantedBy",
  });

  // ZarklyXRole <-> ZarklyXRolePermission
  ZarklyXRole.hasMany(ZarklyXRolePermission, {
    foreignKey: "roleId",
    as: "rolePermissions",
  });
  ZarklyXRolePermission.belongsTo(ZarklyXRole, {
    foreignKey: "roleId",
    as: "role",
  });

  // ZarklyXRole <-> ZarklyXPermission (Many-to-Many through RolePermission)
  ZarklyXRole.belongsToMany(ZarklyXPermission, {
    through: ZarklyXRolePermission,
    foreignKey: "roleId",
    otherKey: "permissionId",
    as: "permissions",
  });
  ZarklyXPermission.belongsToMany(ZarklyXRole, {
    through: ZarklyXRolePermission,
    foreignKey: "permissionId",
    otherKey: "roleId",
    as: "roles",
  });

  // ZarklyXPermission <-> ZarklyXRolePermission
  ZarklyXPermission.hasMany(ZarklyXRolePermission, {
    foreignKey: "permissionId",
    as: "rolePermissions",
  });
  ZarklyXRolePermission.belongsTo(ZarklyXPermission, {
    foreignKey: "permissionId",
    as: "permission",
  });

  // ZarklyXPermission <-> ZarklyXUserPermissionOverride
  ZarklyXPermission.hasMany(ZarklyXUserPermissionOverride, {
    foreignKey: "permissionId",
    as: "userOverrides",
  });
  ZarklyXUserPermissionOverride.belongsTo(ZarklyXPermission, {
    foreignKey: "permissionId",
    as: "permission",
  });

  console.log("✅ ZarklyX RBAC associations initialized");

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
    SocialToken,
    Employee,
    ItTickets,
    Influencer,
    InfluencerCategory,
    Industry,
    Platform,
    ItemCategory,
    Unit,
    Item,
    Vendor,
    Invoice,
    InvoiceItem,
    InvoiceTdsTcs,
    Quote,
    QuoteItem,
    QuoteTdsTcs,
    PurchaseBill,
    PurchaseBillItem,
    PurchaseBillTdsTcs,
    PurchaseOrder,
    PurchaseOrderItem,
    Payments,
    PaymentsDocuments,
    CreditNote,
    CreditNoteItem,
    DebitNote,
    DebitNoteItem,
    AccountingDocument,
    Modules,
    Permissions,
    SubscriptionPlan,
    SubscriptionPlanModule,
    SubscriptionPlanPermission,
    CompanySubscription,
    CompanyModule,
    CompanyPermission,
    Role,
    RolePermissions,
    UserPermissionOverrides,
  };
}
