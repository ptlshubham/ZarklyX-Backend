const Joi = require("joi");
const createError = require("http-errors");

const validate = (schema) => (req, res, next) => {
  // Define Joi options
  const options = {
    abortEarly: false, // Include all errors
    allowUnknown: true, // Ignore unknown properties on the request object
    stripUnknown: true, // Remove unknown properties from the validated object
  };

  // Validate the request object (req) directly against the schema
  const { error, value } = schema.validate(req, options);

  if (error) {
    const errorMessage = error.details
      .map((details) => details.message)
      .join(", ");
    return next(createError(400, errorMessage));
  }

  // Assign the validated and cleaned value back to the request object.
  // This is useful if you use Joi to set default values.
  Object.assign(req, value);

  return next();
};

module.exports = validate;
