const multer = require("multer");
const path = require("path");
const fs = require("fs");
const createError = require("http-errors");
const { v4: uuidv4 } = require("uuid");

/**
 * A factory function to create a configured Multer upload middleware.
 * @param {string} destinationPath - The sub-folder within 'public/uploads' (e.g., 'offers', 'avatars').
 * @param {number} fileSizeLimit - The file size limit in bytes (e.g., 5 * 1024 * 1024 for 5MB).
 * @param {object} allowedMimeTypes - An object mapping allowed mimetypes to extensions (e.g., { 'image/jpeg': '.jpeg' }).
 * @returns {multer} A configured Multer instance.
 */
const createUploadMiddleware = (
  destinationPath,
  fileSizeLimit = 1,
  allowedMimeTypes
) => {
  // 1. Configure storage location and filename
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join("public", "uploads", destinationPath);
      fs.mkdirSync(uploadPath, { recursive: true }); // Ensure directory exists
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = uuidv4();
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });

  // 2. Configure file filter based on MIME types
  const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes[file.mimetype]) {
      cb(null, true); // Accept the file
    } else {
      cb(
        createError(
          400,
          "Invalid file type. Only JPG, JPEG, and PNG are allowed."
        ),
        false
      ); // Reject the file
    }
  };

  // 3. Return the configured Multer instance
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: fileSizeLimit * 1024 * 1024, // Apply the file size limit
    },
  });
};

module.exports = createUploadMiddleware;
