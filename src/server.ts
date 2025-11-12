
import express, { Request, Response } from "express";
import connectMySQL from "./config/dbSQL"; // Importing MySQL Connection
import { connectDatabases } from "./config/db"; // MongoDB connection
import { initControlDBConnection } from "./db/core/control-db";
import http from "http";
import cors from 'cors';
import { ConsoleSpinner } from "./services/console-info";
const userRoutes = require('./routes/api-app/user/user-api');
// const employeeRoutes = require('./routes/api-webapp/employee/employee-api');
import employeeRoutes from './routes/api-webapp/employee/employee-api';
const appVersionRoutes = require('./routes/api-app/app-version/app-version-api');
const settingsRoutes = require('./routes/api-app/settings/settings-api');

import path from "path";
// import { settingsRoutes } from './routes/api-app/settings/settings-api';
// import "../src/models/index";
import zonesRoutes from './routes/api-webapp/zones/zones-api'; // Uncomment if you have zones routes

const app = express();


//Rinkal 
app.use(cors({
  origin: 'http://localhost:4200', // Angular app  origin
  credentials: true,               // only if you want to send cookies
}));



app.use('/profileFile', express.static(path.join(__dirname, '..', 'public', 'profileFile')));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use("/user", userRoutes);
app.use('/appVersion', appVersionRoutes);
app.use('/settings', settingsRoutes);

// Web App Apis Route Index
app.use("/employee", employeeRoutes);
app.use("/zones", zonesRoutes); // Uncomment if you have zones routes
// Initialize databases (MySQL main, MongoDB and control DB)
(async () => {
  try {
    await connectMySQL();
  } catch (err) {
    // connectMySQL handles retries and returns false on failure; ignore here
  }

  try {
    await connectDatabases();
  } catch (err) {
    console.warn("MongoDB connect warning:", err);
  }

  // Initialize control DB connection (separate instance) - optional
  try {
    await initControlDBConnection();
  } catch (err) {
    console.warn("Control DB init warning:", err);
  }
})();

const server = http.createServer(app);

const unsecurePort = 9005;
server.listen(unsecurePort, () => {
  ConsoleSpinner.success(`HTTP Server running at ${unsecurePort}`);
});


app.get("/api/health", (req: Request, res: Response) => {
  res.json({ message: "API is working fine!" });
});





