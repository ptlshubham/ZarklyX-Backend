import { Application } from "express";

export default (app: Application) => {

    // // Web App Apis Route Index
    // app.use("/auth", require("./api-webapp/authentication/auth-api"));
    app.use("/user", require("./api-webapp/authentication/user/user-api"));
    // Backwards-compatible alias: some clients call /authentication/user/...
    app.use("/authentication/user", require("./api-webapp/authentication/user/user-api"));
    app.use("/company", require("./api-webapp/company/company-api"));
    app.use("/otp", require("./api-webapp/otp/otp-api"));
    app.use("/login-history", require("./api-webapp/loginHistory/loginHistory-api"));
    app.use("/roles", require("./api-webapp/roles/role-api"));
    app.use("/premiumModule", require("./api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-api"));
    app.use("/category", require("./api-webapp/superAdmin/generalSetup/category/category-api"));
    // app.use("/clients", require("./api-webapp/superAdmin/agency/clients/clients-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-2fa-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));
    app.use("/employee", require("./api-webapp/agency/employee/employee-api"));
    app.use("/payroll", require("./api-webapp/payroll/payroll-transaction/payroll-transaction-api"));
    app.use("/businessType", require("./api-webapp/superAdmin/generalSetup/businessType/businessType-api"));
    // app.use("/youtube", require("./api-webapp/other/youtube/youtube-api"));
    app.use("/youtube", require("./api-webapp/agency/social-Integration/youtube/youtube-api"));
    app.use("/google-business", require("./api-webapp/agency/social-Integration/google-business/google-business-api"));
    app.use("/gmail", require("./api-webapp/agency/social-Integration/gmail/gmail-api"));
    app.use("/drive", require("./api-webapp/agency/social-Integration/drive/drive-api"));
    app.use("/google", require("./api-webapp/agency/social-Integration/google/google-api"));
    app.use("/linkedin", require("./api-webapp/agency/social-Integration/linkedin/linkedin-api"));
    app.use("/facebook", require("./api-webapp/agency/social-Integration/facebook/facebook-api"));
    app.use("/pinterest", require("./api-webapp/agency/social-Integration/pinterest/pinterest-api"));
    app.use("/twitter", require("./api-webapp/agency/social-Integration/twitter/twitter-api"));
    app.use("/tiktok", require("./api-webapp/agency/social-Integration/tiktok/tiktok-api"));
    app.use("/influencer", require("./api-webapp/influencer/influencer-api"));
    app.use("/itManagement/itTickets", require("./api-webapp/itManagement/itTickets/itTickets-api"));
    app.use("/itManagement/itAssetsManagement", require("./api-webapp/it-Management/it-Assets-Management/it-Assets-Management-api"));
    // app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));
    app.use("/seo", require("./api-webapp/seo/api/index"))
    // app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));

    app.use("/influencerCategory", require("./api-webapp/influencer/category/influencerCategory-api"));
    app.use("/influencerIndustry", require("./api-webapp/influencer/industry/industry-api"));
    app.use("/influencerPlatform", require("./api-webapp/influencer/platform/platform-api"));
    app.use("/accounting/item-Category", require("./api-webapp/accounting/item-Category/item-Category-api"));
    app.use("/accounting/unit", require("./api-webapp/accounting/unit/unit-api"));
    app.use("/accounting/item", require("./api-webapp/accounting/item/item-api"));
    app.use("/accounting/vendor", require("./api-webapp/accounting/vendor/vendor-api"));
    app.use("/accounting/invoice/tds-tcs", require("./api-webapp/accounting/invoice/tds-tcs/invoice-tds-tcs-api"));
    app.use("/accounting/invoice", require("./api-webapp/accounting/invoice/invoice-api"));
    app.use("/accounting/quote/tds-tcs", require("./api-webapp/accounting/quote/tds-tcs/quote-tds-tcs-api"));
    app.use("/accounting/quote", require("./api-webapp/accounting/quote/quote-api"));
    app.use("/accounting/credit-note", require("./api-webapp/accounting/credit-Note/credit-note-api"));
    app.use("/accounting/purchase-bill/tds-tcs", require("./api-webapp/accounting/purchase-Bill/tds-tcs/pb-tds-tcs-api"));
    app.use("/accounting/purchase-bill", require("./api-webapp/accounting/purchase-Bill/purchase-bill-api"));
    app.use("accounting/purchaseOrder", require("./api-webapp/accounting/purchaseOrder/purchase-order-api"));
    app.use("/accounting/payments", require("./api-webapp/accounting/payments/payments-api"));
    app.use("/accounting/debit-note", require("./api-webapp/accounting/debtit-Note/debit-note-api"));
    app.use("/superAdmin/modules", require("./api-webapp/superAdmin/modules/module-api"));
    app.use("/superAdmin/permissions", require("./api-webapp/superAdmin/permissions/permissions-api"));
    app.use("/superAdmin/subscription-plan", require("./api-webapp/superAdmin/subscription-plan/subscription-plan-api"));
    app.use("/superAdmin/subscription-plan-module", require("./api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-api"));
    app.use("/superAdmin/subscription-plan-permission", require("./api-webapp/superAdmin/subscription-plan-permission/subscription-plan-permission-api"));
    app.use("/company-module", require("./api-webapp/company/company-module/company-module-api"));
    app.use("/company-subscription", require("./api-webapp/company/company-subscription/company-subscription-api"));
    app.use("/company-permission", require("./api-webapp/company/company-permission/company-permission-api"));
    app.use("/role-permissions", require("./api-webapp/roles/role-permissions/role-permissions-api"));
    app.use("/user-overrides", require("./api-webapp/roles/user-permission-overrides/user-permission-overrides-api"));
    app.use("/rbac", require("./api-webapp/roles/rbac-api"));

    // ROUTES for ZarklyX Users Role Base System
    app.use("/superAdmin/zarklyx/auth", require("./api-webapp/superAdmin/zarklyX-auth/zarklyX-auth-api"));
    app.use("/superAdmin/zarklyx/users", require("./api-webapp/superAdmin/zarklyX-users/zarklyX-uesrs-api"));
    app.use("/superAdmin/zarklyx/roles", require("./api-webapp/superAdmin/zarklyX-roles/zarklyX-roles-api"));
    app.use("/superAdmin/zarklyx/permissions", require("./api-webapp/superAdmin/zarklyX-permissions/zarklyX-permissions-api"));
    app.use("/superAdmin/zarklyx/role-permissions", require("./api-webapp/superAdmin/zarklyX-role-permissions/zarklyX-role-permissions-api"));
    app.use("/superAdmin/zarklyx/overrides", require("./api-webapp/superAdmin/zarklyX-user-permission-override/zarklyX-user-permission-override-api"));
    app.use("/superAdmin/zarklyx/2fa", require("./api-webapp/superAdmin/zarklyX-2fa/zarklyX-2fa-api"));

};

