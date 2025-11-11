const { Sequelize, DataTypes } = require("sequelize");
const config = require("../config/config");
const logger = require("../utils/logger");

// Import model definition functions
const userModel = require("../modules/users/user.model");
const sellModel = require("../modules/sells/sell.model");
const scrapeCategoryModel = require("../modules/scrape-categories/scrapeCategory.model");
const subCategoryModel = require("../modules/sub-categories/subCategory.model");
const unitModel = require("../modules/units/unit.model");
const currencyModel = require("../modules/currencies/currency.model");
const paymentTermModel = require("../modules/payment-terms/paymentTerm.model");
const priceTermModel = require("../modules/price-terms/priceTerm.model");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: config.db.storage,
  logging: false,
});

const initializeDatabase = async (app) => {
  try {
    await sequelize.authenticate();
    logger.info("💾 Database connection established successfully.");

    // Load models
    userModel(sequelize, DataTypes);
    sellModel(sequelize, DataTypes);
    scrapeCategoryModel(sequelize, DataTypes);
    subCategoryModel(sequelize, DataTypes);
    unitModel(sequelize, DataTypes);
    currencyModel(sequelize, DataTypes);
    paymentTermModel(sequelize, DataTypes);
    priceTermModel(sequelize, DataTypes);
    // Add other models here, e.g., offerModel(sequelize)

    const { User, Sell } = sequelize.models;
    User.hasMany(Sell);
    Sell.belongsTo(User);

    await sequelize.sync({ alter: false }); // Use alter:true to update tables
    // await sequelize.sync({ force: true }); // Use force:true to drop and re-create tables
    logger.info("Database models synced successfully.");

    // Attach sequelize instance to the app object
    app.set("sequelize", sequelize);
  } catch (error) {
    console.log(error);
    logger.error(`Unable to connect to the database: ${error.message}`);
    process.exit(1);
  }
};

module.exports = initializeDatabase;
