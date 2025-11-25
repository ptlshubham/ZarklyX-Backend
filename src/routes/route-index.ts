import { Application } from "express";

export default (app: Application) => {

    // // Web App Apis Route Index
    app.use("/user", require("./api-webapp/user/user-api"));
    app.use("/company", require("./api-webapp/company/company-api"));
    app.use("/otp", require("./api-webapp/otp/otp-api"));
};

