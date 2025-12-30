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
    // app.use("/clients", require("./api-webapp/agency/clients/clients-login-api"));

};

