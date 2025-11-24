import mongoose from 'mongoose';
import { Options, Sequelize } from "sequelize";
import configs from '../config/config';
// import dotenv from 'dotenv';
import environment from "../../environment";

// Load environment variables
// dotenv.config();

const config = (configs as { [key: string]: Options })[environment];
// Ensure TypeScript understands the environment config
const currentEnv: keyof typeof config = (process.env.NODE_ENV as keyof typeof config) || 'development';
// const mongoURI = config[currentEnv].mongo.uri;

// export const connectMongoDB = async () => {
//   try {
//     await mongoose.connect(mongoURI);
//     console.log(`MongoDB Connected Successfully! (${currentEnv})`);
//   } catch (error) {
//     console.error("MongoDB Connection Failed:", error);  
//     process.exit(1);
//   }
// };

export { mongoose };