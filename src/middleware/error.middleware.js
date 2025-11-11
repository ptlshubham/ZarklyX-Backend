const httpStatus = require("http-status").status;
const { Sequelize } = require("sequelize");
const logger = require("../utils/logger");
const config = require("../config/config");
const multer = require("multer");

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
  let responseBody;

  // Log the error for debugging purposes
  if (config.env === "development") {
    logger.error(err);
  }

  // --- HANDLE SPECIFIC SEQUELIZE ERRORS WITH DETAILED RESPONSE ---

  if (err instanceof Sequelize.ValidationError) {
    statusCode = httpStatus.BAD_REQUEST; // 400
    const errorDetails = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
    responseBody = {
      success: false,
      type: "ValidationError",
      message: errorDetails.map((err) => `${err.message}`).join(", "), //"One or more validation errors occurred.",
      errors: errorDetails,
    };
  } else if (err instanceof Sequelize.UniqueConstraintError) {
    statusCode = httpStatus.CONFLICT; // 409
    const errorDetails = err.errors.map((e) => ({
      field: e.path,
      message: `${e.path} must be unique.`,
      value: e.value,
    }));
    responseBody = {
      success: false,
      type: "UniqueConstraintError",
      message: "A record with the provided value already exists.",
      errors: errorDetails,
    };
  } else if (err instanceof Sequelize.ForeignKeyConstraintError) {
    statusCode = httpStatus.BAD_REQUEST; // 400
    responseBody = {
      success: false,
      type: "ForeignKeyConstraintError",
      message: "Invalid reference to a related entity.",
      field: err.index,
    };
  }

  // --- HANDLE GENERIC OR HTTP-ERRORS ---
  else {
    responseBody = {
      success: false,
      message: err.message || "An unexpected error occurred.",
      // Only include the stack trace in development mode
      ...(config.env === "development" && { stack: err.stack }),
    };
  }

  res.status(statusCode).json(responseBody);
};

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = "An error occurred during file upload.";
    if (err.code === "LIMIT_FILE_SIZE") {
      message =
        "File is too large. Please upload a file smaller than the specified limit.";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Too many files uploaded. Please adhere to the file limit.";
    }

    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message,
    });
  }

  // If it's not a Multer error, pass it to the next error handler
  next(err);
};

module.exports = {
  errorHandler,
  handleMulterError,
};
