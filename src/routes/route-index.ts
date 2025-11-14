import { Application } from "express";

export default (app: Application) => {

    // // Web App Apis Route Index
    app.use("/user", require("./api-webapp/user/user-api"));
};

