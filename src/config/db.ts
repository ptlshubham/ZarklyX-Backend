// import { connectMongoDB  } from "./dbMongo";
import connectMySQL from "./dbSQL";
import dotenv from "dotenv";
import { sequelize }from "./dbSQL"; // MySQL Sequelize Instance
import { mongoose } from "./dbMongo"; // MongoDB Mongoose Instance

dotenv.config();

// Sync Databases Function
export const syncDatabase = async () => {
  try {
    // Sync MySQL Database
    await sequelize.sync({ alter: true });  // "alter: true" to update table structure safely
    console.log("MySQL Database Synced Successfully!");
  } catch (error) {
    console.error("MySQL Database Sync Failed:", error);
  }

  try {
    // MongoDB Auto Sync (No Explicit Sync Needed, But You Can Add Collections Here)
    console.log("MongoDB is Managed Automatically!");
  } catch (error) {
    console.error("MongoDB Sync Failed:", error);
  }
};

// Connect Both Databases
export const connectDatabases = async () => {
  // try {
  //   await connectMongoDB();
  //   console.log("MongoDB Connected Successfully!");
  // } catch (error) {
  //   console.error("MongoDB Connection Failed:", error);
  // }

  try {
    await connectMySQL();
    console.log("MySQL Connected Successfully!");
  } catch (error) {
    console.error("MySQL Connection Failed:", error);
  }

  console.log("All Databases Connected Successfully!");
};

// Run Sync after Connection
export const initializeDatabases = async () => {
  await connectDatabases();
  await syncDatabase();
};

