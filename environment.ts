// // environment.ts

// const environment = {
//   NODE_ENV: "development",

//   // MySQL Configuration
//   MYSQL_DB_NAME: "rideit_dev",
//   MYSQL_DB_USERNAME: "root",
//   MYSQL_DB_PASSWORD: "", // If no password, leave it empty
//   MYSQL_DB_HOST: "localhost",

//   // MongoDB Configuration
//   MONGO_URI: "mongodb://127.0.0.1:27017/zarklyX_dev",

//   // URLs & Security Configurations
//   API_URL: "http://localhost:9005",  // Backend API URL
//   ADMIN_URL: "http://localhost:4200", // Admin Panel URL (if applicable)
//   CRYPTO_KEY: "rideit_secure_key",   // Encryption key for sensitive data

//   // Email Configuration (using Hostinger or Gmail)
//   SENDER_EMAIL_HOST: "smtp.hostinger.com",  // Or 'smtp.gmail.com' for Gmail
//   SENDER_EMAIL_PORT: 465,                   // Port for secure email (SSL)
//   SENDER_EMAIL_ID: "your_current@gmail.com",    // Your email address (Hostinger/Gmail)
//   SENDER_EMAIL_PASSWORD: "your_secure_pwd", // App password or actual SMTP password
// };

// export default environment;

export const env = {
  development: "development",
  production: "production",
  staging: "staging",
  
};

// ZarklyX Configuration
export const zarklyXConfig = {
  projectName: "ZarklyX",
  version: "1.0.0",
};

export default env.development;
