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

import path from "path";
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
(routes as any)(app);

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


