import { Sequelize } from "sequelize";
import config from "./config"; // Importing config file

// Ensure TypeScript understands the environment config
const currentEnv: keyof typeof config = "development"; // Hardcoded for now

//  MySQL configuration
// const mysqlConfig = config[currentEnv].mysql;
const mysqlConfig = config[currentEnv];

const sequelize = new Sequelize(
  mysqlConfig.database,
  mysqlConfig.username,
  mysqlConfig.password || "",
  {
    host: mysqlConfig.host,
    dialect: "mysql",
    logging: mysqlConfig.logging,
    timezone: mysqlConfig.timezone,
  }
);

// MySQL connection test
const connectMySQL = async () => {
  try {
    await sequelize.authenticate();
    console.log(`MySQL Connected Successfully! (${currentEnv})`);
  } catch (error) {
    console.error("MySQL Connection Failed:", error);
    process.exit(1);
  }
};

export default connectMySQL;
export { sequelize };
