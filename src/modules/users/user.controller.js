const userService = require("./user.service");
const logger = require("../../utils/logger");
const { generateToken } = require("../../services/token.service");

const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(
      req.app.get("sequelize"),
      req.body
    );
    
    const token = generateToken(
      {
        sub: user.id,
        email: user.email,
        fingerprint: {
          userAgent: req.headers["user-agent"],
          ipAddress: req.ip,
        },
        role: "user",
      },
      "1H"
    );

    delete user.password;
    res.status(201).json({ success: true, data: user, token });
  } catch (error) {
    next(error); // Pass error to the central error handler
  }
};

const checkEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await userService.checkEmail(req.app.get("sequelize"), email);
    if (user) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });
    }
    res.status(200).json({ success: true, message: "Email is available" });
  } catch (error) {
    next(error);
  }
};

const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.body;
    const user = await userService.checkUsername(
      req.app.get("sequelize"),
      username
    );
    if (user) {
      return res
        .status(400)
        .json({ success: false, message: "Username already exists" });
    }
    res.status(200).json({ success: true, message: "Username is available" });
  } catch (error) {
    next(error);
  }
};

const getUserData = async (req, res, next) => {
  try {
    const user = await userService.getUserById(
      req.app.get("sequelize"),
      req.user.id
    );
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

const getUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const user = await userService.getUserById(
      req.app.get("sequelize"),
      userId
    );
    logger.info(`User with ID: ${userId} retrieved successfully`);
    res.status(200).json(user);
  } catch (error) {
    logger.error(`Error retrieving user: ${error.message}`);
    next(error);
  }
};

module.exports = {
  createUser,
  checkEmail,
  checkUsername,
  getUserData,
  getUser,
};
