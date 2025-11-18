import express from "express";
import errorHandler from "./middleware/errorHandler.middleware";
const fs = require("fs");
import configs from "./config/config";
import environment from "../environment";
import { Application, Request } from "express";
import cors from "cors";
import currentUser from "./services/current-user";
import routes from "./routes/route-index";

const config = (configs as { [key: string]: any })[environment];
const app = express();
// const settingsRoutes = require('./routes/api-app/settings/settings-api');

const userRoutes = require('./routes/api-webapp/user/user-api');
const companyRoutes = require('./routes/api-webapp/company/company-api');
const otpRoutes = require('./routes/api-webapp/otp/otp-api');
// const loginHistoryRoutes = require('./routes/api-webapp/loginHistory/loginHistory-api');

import path from "path";
app.use(express.json());
app.use(cors());

app.use("/user", userRoutes);
app.use("/company", companyRoutes);
app.use("/otp", otpRoutes);
// app.use("/loginHistory", loginHistoryRoutes);


//global error handler
app.use(errorHandler);

// Cronjob.startAll();

app.use('/profileFile', express.static(path.join(__dirname, '..', 'public', 'profileFile')));
app.post('*', (req, res, next) => {
  req.query = hydrateUser(req.query)
  next();
});

app.put('*', (req, res, next) => {
  req.query = hydrateUser(req.query)
  next();
});

// initProsesConfig();
(routes as any)(app);

app.use("/", (req, res) => {
  res.status(404).send("Route Not Found");
});

export default app;

function hydrateUser(query: any) {
  if (!query.userData) {
    return query;
  }

  currentUser.hydrate(JSON.parse(query.userData));
  delete query.userData;
  return query
}



