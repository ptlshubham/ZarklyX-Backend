const express = require("express");
const router = express.Router();

const {
  createUser,
  checkEmail,
  checkUsername,
  getUserData,
  getUser,
} = require("./user.controller");
const validate = require("../../middleware/validation.middleware");
const { createUserSchema, getUserSchema } = require("./user.validation.js");
const { protect, isUser } = require("../../middleware/auth.middleware");

// router.use(protect, isAdmin);

// POST /api/users - Create a new user
router.post("/register-now", validate(createUserSchema), createUser);
// POST /api/users/check-email - Check if email exists
router.post("/check-email", checkEmail);
// POST /api/users/check-username - Check if username exists
router.post("/check-username", checkUsername);
router.get("/", [protect, isUser], getUserData);

// GET /api/users/:userId - Get a user by ID
// router.get("/:userId", validate(getUserSchema), getUser);

module.exports = router;
