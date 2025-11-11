const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/auth.middleware");
const createUploadMiddleware = require("../../middleware/file.middleware");
const { handleMulterError } = require("../../middleware/error.middleware");
const sellController = require("./sell.controller");

// --- Define the validation options for file uploads ---
const allowedMimeTypes = {
  "image/jpeg": ".jpeg",
  "image/jpg": ".jpg",
  "image/png": ".png",
};
const fileSizeLimit = 1; // 1 MB
const destination = "sells";

// --- Create the specific upload middleware ---
const uploadSellImages = createUploadMiddleware(
  destination,
  fileSizeLimit,
  allowedMimeTypes
);

/**
 * GET /api/sells
 * Retrieves a list of all sell records. This is a public route.
 */
router.get("/", sellController.getAllSells);

/**
 * POST /api/sells
 * Creates a new sell record. User must be authenticated.
 */
router.post(
  "/",
  protect,
  uploadSellImages.array("images", 5), // 'images' is the field name, 5 is the max count
  handleMulterError,
  sellController.createSell
);

/**
 * DELETE /api/sells/:sellId/images
 * Deletes a specific image from a sell record. User must be authenticated.
 */
router.delete("/:sellId/images", protect, sellController.deleteImage);

module.exports = router;
