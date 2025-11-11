const createError = require("http-errors");
const random = require("../../utils/random");
const { sendEmail } = require("../../services/email.service");

/**
 * Creates a new user in the database.
 * @param {object} sequelize - The Sequelize instance.
 * @param {object} userData - The user data to create.
 * @returns {Promise<object>} The created user object.
 */
const createUser = async (sequelize, userData) => {
  const { User } = sequelize.models;
  // const existingUser = await User.findOne({ where: { email: userData.email } });
  // if (existingUser) {
  //   throw createError(409, "User with this email already exists");
  // }
  userData.password = random(8);

  const subject = "Welcome! Your Account Details";
  const text = `Hi ${userData.username},\n\nYour account has been created successfully.\nYour temporary password is: ${userData.password}\n\nPlease change it after your first login.`;
  // await sendEmail(userData.email, subject, text);

  return User.create(userData);
};

const checkEmail = async (sequelize, email) => {
  const { User } = sequelize.models;
  const user = await User.count({ attributes: ["id"], where: { email } });
  return user > 0;
};

const checkUsername = async (sequelize, username) => {
  const { User } = sequelize.models;
  const user = await User.count({ attributes: ["id"], where: { username } });
  return user > 0;
};

/**
 * Finds a user by their ID.
 * @param {object} sequelize - The Sequelize instance.
 * @param {number} userId - The ID of the user to find.
 * @returns {Promise<object>} The found user object.
 */
const getUserById = async (sequelize, userId) => {
  const { User } = sequelize.models;
  const user = await User.findByPk(userId);
  if (!user) {
    throw createError(404, "User not found");
  }
  return user;
};

module.exports = {
  createUser,
  checkEmail,
  checkUsername,
  getUserById,
};
