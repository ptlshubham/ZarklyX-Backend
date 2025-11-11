const jwt = require("jsonwebtoken");
const config = require("../config/config");

/**
 * Generates a JSON Web Token.
 * @param {object} payload - The data to include in the token (e.g., { sub: userId, role: 'admin' }).
 * @returns {string} The generated JWT token.
 */
const generateToken = (payload, expiresIn = config.jwt.expiresIn || "1D") => {
  const secret = config.jwt.secret;
  const options = { expiresIn: expiresIn };

  if (!payload || !secret || !options.expiresIn) {
    throw new Error("Payload, secret key, and expiration time are required.");
  }

  payload.iss = config.jwt.issuer;
  payload.iat = Math.floor(Date.now() / 1000);
  return jwt.sign(payload, secret, options);
};

/**
 * Verifies a JSON Web Token.
 * @param {string} token - The JWT token to verify.
 * @returns {object | null} The decoded payload if the token is valid, otherwise null.
 */
const verifyToken = (token) => {
  const secret = config.jwt.secret;
  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    // This will catch errors like 'jwt expired' or 'invalid signature'
    return null;
  }
};

module.exports = { generateToken, verifyToken };
