const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

// Load .env file from the root directory
dotenv.config({ path: path.join(__dirname, "../../.env"), quiet: true });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .required(),
    PORT: Joi.number().default(3000),
    DB_STORAGE_PATH: Joi.string()
      .required()
      .description("Database storage path"),
    JWT_SECRET: Joi.string().required().description("JWT secret key"),
    JWT_EXPIRES_IN: Joi.string().required().description("JWT expiration"),
    JWT_ISSUER: Joi.string().required().description("JWT issuer"),
    STRIPE_SECRET_KEY: Joi.string().required(),
    STRIPE_PUBLISHABLE_KEY: Joi.string().required(),
    STRIPE_WEBHOOK_SECRET: Joi.string().required(),
    CLIENT_URL: Joi.string().required(),
    SMTP_HOST: Joi.string().required(),
    SMTP_PORT: Joi.number().required(),
    SMTP_USER: Joi.string().required(),
    SMTP_PASS: Joi.string().required(),
    EMAIL_FROM: Joi.string().email().required(),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  db: {
    storage: envVars.DB_STORAGE_PATH,
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    issuer: envVars.JWT_ISSUER,
  },
  stripe: {
    secretKey: envVars.STRIPE_SECRET_KEY,
    publishableKey: envVars.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
  },
  clientUrl: envVars.CLIENT_URL,
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USER,
        pass: envVars.SMTP_PASS,
      },
    },
    from: envVars.EMAIL_FROM,
  },
};
