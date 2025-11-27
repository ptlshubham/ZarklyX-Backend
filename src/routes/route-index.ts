import { Application } from "express";

export default (app: Application) => {

    // // Web App Apis Route Index
    // app.use("/auth", require("./api-webapp/authentication/auth-api"));
    app.use("/user", require("./api-webapp/authentication/user/user-api"));
    app.use("/company", require("./api-webapp/company/company-api"));
    app.use("/otp", require("./api-webapp/otp/otp-api"));
    app.use("/premiumModule", require("./api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-api"));
    app.use("/category", require("./api-webapp/superAdmin/generalSetup/category/category-api"));
};

