import { Application } from "express";

export default (app: Application) => {

    // // Web App Apis Route Index
    // app.use("/auth", require("./api-webapp/authentication/auth-api"));
    app.use("/user", require("./api-webapp/authentication/user/user-api"));
    app.use("/company", require("./api-webapp/company/company-api"));
    app.use("/otp", require("./api-webapp/otp/otp-api"));
    app.use("/login-history", require("./api-webapp/loginHistory/loginHistory-api"));
    app.use("/premiumModule", require("./api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-api"));
    app.use("/category", require("./api-webapp/superAdmin/generalSetup/category/category-api"));
    // app.use("/clients", require("./api-webapp/superAdmin/agency/clients/clients-api"));
    app.use("/clients", require("./api-webapp/agency/clients/clients-api")); 
    app.use("/businessType", require("./api-webapp/superAdmin/generalSetup/businessType/businessType-api"));
    // app.use("/youtube", require("./api-webapp/other/youtube/youtube-api"));
    app.use("/youtube", require("./api-webapp/agency/social-Integration/youtube/youtube-api"));
    app.use("/google-business", require("./api-webapp/agency/social-Integration/google-business/google-business-api"));
    app.use("/gmail", require("./api-webapp/agency/social-Integration/gmail/gmail-api"));
    app.use("/drive", require("./api-webapp/agency/social-Integration/drive/drive-api"));
    app.use("/google", require("./api-webapp/agency/social-Integration/google/google-api"));
    // app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));

};

