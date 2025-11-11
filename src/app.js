const express = require("express");
const httpStatus = require("http-status");
const createError = require("http-errors");
const { errorHandler } = require("./middleware/error.middleware");
const initializeDatabase = require("./plugins/db");
// User routes
const userRoutes = require("./modules/users/user.routes");
const sellRoutes = require('./modules/sells/sell.routes');
// Admin routes
const scrapeCategoryRoutes = require("./modules/scrape-categories/scrapeCategory.routes");
const subCategoryRoutes = require("./modules/sub-categories/subCategory.routes");
const unitRoutes = require("./modules/units/unit.routes");
const currencyRoutes = require("./modules/currencies/currency.routes");
const paymentTermRoutes = require("./modules/payment-terms/paymentTerm.routes");
const priceTermRoutes = require("./modules/price-terms/priceTerm.routes");

const app = express();

// Initialize Database
initializeDatabase(app);

// Parse json request body
app.use(express.json());

// Parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
app.get("/", (req, res) => {
  res.send("API is running...");
});

// User routes
app.use("/api/users", userRoutes);
app.use('/api/sells', sellRoutes);

// Admin routes
app.use("/api/scrape-categories", scrapeCategoryRoutes);
app.use("/api/sub-categories", subCategoryRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/currencies", currencyRoutes);
app.use("/api/payment-terms", paymentTermRoutes);
app.use("/api/price-terms", priceTermRoutes);
// Add other routes here, e.g., app.use('/api/offers', offerRoutes);

// --- Error Handling ---
// Send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(createError(httpStatus.status.NOT_FOUND, "Not found"));
});

// Central error handler
app.use(errorHandler);

module.exports = app;
