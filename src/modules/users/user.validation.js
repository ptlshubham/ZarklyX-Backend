const Joi = require("joi");

const createUserSchema = Joi.object({
  body: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),

    companyName: Joi.string().min(2).max(100).required(),

    contactName: Joi.string().min(2).max(100).required(),

    email: Joi.string().email().required(),

    // E.164-ish format: optional leading +, then country code and subscriber (up to 15 digits total)
    telephone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .message(
        "Telephone must be in international E.164 format, e.g. +14155552671 or 4155552671"
      )
      .required(),

    mobileNumber: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .message(
        "Mobile number must be in international E.164 format, e.g. +919876543210 or 919876543210"
      )
      .required(),

    website: Joi.string().uri().optional().allow(null, ""),

    address: Joi.string().max(100).optional().allow(null, ""),

    // country is required but no default — supports international values
    country: Joi.string().min(2).max(100).required(),

    // state: allow international names (letters, numbers, spaces, hyphens, commas, periods, parentheses, apostrophes)
    state: Joi.string()
      .pattern(/^[A-Za-z0-9\s\-\.,'()]{1,100}$/)
      .message("State contains invalid characters")
      .required(),

    // postal/zip: international-friendly (alphanumeric, spaces, hyphens), 3-10 chars
    zipCode: Joi.string()
      .pattern(/^[A-Za-z0-9\s\-]{3,10}$/)
      .message(
        "Zip/Postal code must be 3-10 characters; letters, numbers, spaces and hyphens allowed"
      )
      .required(),

    aboutProducts: Joi.string().max(500).optional().allow(null, ""),
  }).required(),
});

const getUserSchema = Joi.object({
  params: Joi.object({
    userId: Joi.number().integer().required(),
  }).required(),
});

module.exports = {
  createUserSchema,
  getUserSchema,
};
