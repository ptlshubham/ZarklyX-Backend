
import express, { Request, Response } from "express";
import connectMySQL from "./config/dbSQL"; // Importing MySQL Connection
import { connectDatabases } from "./config/db"; // MongoDB connection
import { initControlDBConnection } from "./db/core/control-db";
import http from "http";
import cors from 'cors';
import { ConsoleSpinner } from "./services/console-info";
const userRoutes = require('./routes/api-webapp/user/user-api');

import path from "path";
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

// Web App Apis Route Index
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

// Allow overriding the port with the PORT environment variable (useful in dev or CI)
const unsecurePort = Number(process.env.PORT) || 9005;

// Start server with explicit error handling so EADDRINUSE gives a clear message
server.listen(unsecurePort)
  .on('listening', () => {
    ConsoleSpinner.success(`HTTP Server running at ${unsecurePort}`);
  })
  .on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${unsecurePort} is already in use. ${err.message}`);
      console.error('Stop the process using that port or set PORT to a free port before retrying.');
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });


app.get("/api/health", (req: Request, res: Response) => {
  res.json({ message: "API is working fine!" });
});





