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
    app.use("/roles", require("./api-webapp/roles/roles-api"));
    app.use("/premiumModule", require("./api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-api"));
    app.use("/category", require("./api-webapp/superAdmin/generalSetup/category/category-api"));
    // app.use("/clients", require("./api-webapp/superAdmin/agency/clients/clients-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-2fa-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));
    app.use("/employee", require("./api-webapp/agency/employee/employee-api"));
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

    // app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));

    app.use("/influencerCategory", require("./api-webapp/influencer/category/influencerCategory-api"));
    app.use("/influencerIndustry", require("./api-webapp/influencer/industry/industry-api"));
    app.use("/influencerPlatform", require("./api-webapp/influencer/platform/platform-api"));
    app.use("/accounting/item-Category",require("./api-webapp/accounting/item-Category/item-Category-api"));
    app.use("/accounting/unit",require("./api-webapp/accounting/unit/unit-api"));
    app.use("/accounting/item",require("./api-webapp/accounting/item/item-api"));
    app.use("/accounting/vendor",require("./api-webapp/accounting/vendor/vendor-api"));
    app.use("/accounting/invoice/tds-tcs",require("./api-webapp/accounting/invoice/tds-tcs/invoice-tds-tcs-api"));
    app.use("/accounting/invoice",require("./api-webapp/accounting/invoice/invoice-api"));
    app.use("/accounting/quote/tds-tcs",require("./api-webapp/accounting/quote/tds-tcs/quote-tds-tcs-api"));
    app.use("/accounting/quote",require("./api-webapp/accounting/quote/quote-api"));
    app.use("/accounting/credit-note",require("./api-webapp/accounting/credit-Note/credit-note-api"));
    app.use("/accounting/purchase-bill/tds-tcs",require("./api-webapp/accounting/purchase-Bill/tds-tcs/pb-tds-tcs-api"));
    app.use("/accounting/purchase-bill",require("./api-webapp/accounting/purchase-Bill/purchase-bill-api"));
    app.use("accounting/purchaseOrder",require("./api-webapp/accounting/purchaseOrder/purchase-order-api"));
};

