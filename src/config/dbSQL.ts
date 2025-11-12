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

// MySQL connection test with retry/backoff
const connectMySQL = async (): Promise<boolean> => {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sequelize.authenticate();
      console.log(`✅ MySQL Connected Successfully! (${currentEnv})`);
      return true;
    } catch (error: any) {
      const waitMs = attempt * 2000;
      console.warn(`⚠️ MySQL connection attempt ${attempt}/${maxAttempts} failed: ${error?.message || error}`);
      if (attempt < maxAttempts) {
        console.warn(`    Retrying in ${waitMs}ms...`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      console.warn("⚠️ MySQL Connection Failed - App will run in offline mode");
      console.warn("Make sure MySQL is running on localhost:3306");
      console.warn("Quick fix: Run 'docker run --name zarklyX-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=zarklyX_dev -p 3306:3306 -d mysql:8.0'");
      return false;
    }
  }
  return false;
};

export default connectMySQL;
export { sequelize };
