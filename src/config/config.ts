// config.ts

export = {
  development: {
    dialect: "mysql",
    database: process.env.MYSQL_DB_NAME || "zarklyX_dev",
    username: process.env.MYSQL_DB_USERNAME || "root",
    password: process.env.MYSQL_DB_PASSWORD || null,
    host: process.env.MYSQL_DB_HOST || "localhost",
    
  // host: process.env.MYSQL_DB_HOST || "127.0.0.1",
    logging: false,
    timezone: "+05:30",
    // email: {
    //   SENDER_EMAIL_HOST: "mail.prosesindia.in",
    //   SENDER_EMAIL_PORT: "465",
    //   SENDER_EMAIL_ID: "support@prosesindia.in",
    //   SENDER_EMAIL_PASSWORD: "proses1412",
    // },

    //For Mobile App send OTP
    email: {
      SENDER_EMAIL_HOST: "smtp.hostinger.com",
      SENDER_EMAIL_PORT: "465",
      SENDER_EMAIL_ID: "zarklyX@keryar.com",// br.rinkal1997@gmail.com
      SENDER_EMAIL_PASSWORD: "ZarklyX@dev1", // dmtz kgzb vadp cdki
    },
    ApiUrl: "http://localhost:9005",
    adminURL: "http://localhost:4200",
    templatePath: "src/template",
    publicPath: "src/public",
    // cryptoKey: "rgb*proses",
    cryptoKey: "rideit_secure_key",
    routesPath: "src/routes",
    localUrlAccess: "/../../src/public/",
  },
  // staging: {
  //   dialect: "mysql",
  //   database: process.env.MYSQL_DB_NAME || "rashchine_greenbolt",
  //   username: process.env.MYSQL_DB_USERNAME || "rashchine_g_usr",
  //   password: process.env.MYSQL_DB_PASSWORD || "Proses1412!",
  //   host: process.env.MYSQL_DB_HOST || "127.0.0.1",
  //   logging: false,
  //   timezone: "+05:30",
  //   email: {
  //     SENDER_EMAIL_HOST: "smtp.hostinger.com",
  //     SENDER_EMAIL_PORT: "465",
  //     SENDER_EMAIL_ID: "noreply@greenbolt.in",
  //     SENDER_EMAIL_PASSWORD: "grX8hE&V",
  //   },
  //   ApiUrl: "https://prosesenv.com:9005",
  //   adminURL: "https://prosesenv.com/green-bolt/",
  //   templatePath: "template",
  //   publicPath: "public",
  //   cryptoKey: "rgb*proses",
  //   routesPath: "routes",
  //   localUrlAccess: "/../public/",
  // },


  // production: {
  //   dialect: "mysql",
  //   database: process.env.MYSQL_DB_NAME || "gree_bolt",
  //   username: process.env.MYSQL_DB_USERNAME || "gree_bolt",
  //   password: process.env.MYSQL_DB_PASSWORD || "Ahw+zAkttHzO9q@k",
  //   host: process.env.MYSQL_DB_HOST || "localhost",
  //   logging: false,
  //   timezone: "+05:30",
  //   email: {
  //     SENDER_EMAIL_HOST: "smtp.hostinger.com",
  //     SENDER_EMAIL_PORT: "465",
  //     SENDER_EMAIL_ID: "noreply@greenbolt.in",
  //     SENDER_EMAIL_PASSWORD: "grX8hE&V",
  //   },
  //   ApiUrl: "https://webapp.greenbolt.in:9005",
  //   adminURL: "https://webapp.greenbolt.in/",
  //   templatePath: "template",
  //   publicPath: "public",
  //   routesPath: "routes",
  //   cryptoKey: "rgb*proses",
  //   localUrlAccess: "/../public/",
  // }
};

// interface Config {
//   [key: string]: {
//     mysql: {
//       dialect: string;
//       database: string;
//       username: string;
//       password: string | null;
//       host: string;
//       logging: boolean;
//       timezone: string;
//     };
//     mongo: { uri: string };
//     ApiUrl: string;
//     adminURL: string;
//     cryptoKey: string;

//     //  Email config
//     email: {
//       host: string;
//       port: number;
//       user: string;
//       pass: string;
//     };
//   };
// }

// const config: Config = {
//   development: {
//     mysql: {
//       dialect: "mysql",
//       database: process.env.MYSQL_DB_NAME || "rideit_dev",
//       username: process.env.MYSQL_DB_USERNAME  || "root",
//       password: process.env.MYSQL_DB_PASSWORD || "",
//       host: process.env.MYSQL_DB_HOST || "localhost",
//       logging: false, // Set to true if you want to see SQL logs in the console
//       timezone: "+05:30", // Adjust for your timezone
//     },
//     mongo: {
//       uri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rideit_dev",
//     },
//     ApiUrl: process.env.API_URL || "http://localhost:9005",
//     adminURL: process.env.ADMIN_URL || "http://localhost:4200",
//     cryptoKey: process.env.CRYPTO_KEY || "rideit_secure_key",

//     email: {
//       host: process.env.SENDER_EMAIL_HOST || "smtp.hostinger.com",
//       port: Number(process.env.SENDER_EMAIL_PORT),
//       user: process.env.SENDER_EMAIL_ID || "your_current@gmail.com",
//       pass: process.env.SENDER_EMAIL_PASSWORD || "your_secure_pwd",
//     },
//   },

//   //   production: {
//   //   dialect: "mysql",
//   //   database: process.env.MYSQL_DB_NAME || "gree_bolt",
//   //   username: process.env.MYSQL_DB_USERNAME || "gree_bolt",
//   //   password: process.env.MYSQL_DB_PASSWORD || "Ahw+zAkttHzO9q@k",
//   //   host: process.env.MYSQL_DB_HOST || "localhost",
//   //   logging: false,
//   //   timezone: "+05:30",
//   //   email: {
//   //     SENDER_EMAIL_HOST: "smtp.hostinger.com",
//   //     SENDER_EMAIL_PORT: "465",
//   //     SENDER_EMAIL_ID: "noreply@greenbolt.in",
//   //     SENDER_EMAIL_PASSWORD: "grX8hE&V",
//   //   },
//   //   ApiUrl: "https://webapp.greenbolt.in:9005",
//   //   adminURL: "https://webapp.greenbolt.in/",
//   //   templatePath: "template",
//   //   publicPath: "public",
//   //   routesPath: "routes",
//   //   cryptoKey: "rgb*proses",
//   //   localUrlAccess: "/../public/",
//   // }
// };

// export default config;



