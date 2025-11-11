const nodemailer = require("nodemailer");
const config = require("../config/config");
const logger = require("../utils/logger");

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  ...config.email.smtp,
  connectionTimeout: 5000,
});

// Verify the connection configuration on startup
if (config.env === "development") {
  transporter
    .verify()
    .then(() =>
      logger.info("📧 Email service is connected and ready to send emails.")
    )
    .catch((err) =>
      logger.error(`Email service connection error: ${err.message}`)
    );
}

/**
 * Sends an email.
 * @param {string} to - Recipient's email address.
 * @param {string} subject - Email subject.
 * @param {string} text - Plain text body of the email.
 * @param {string} [html] - HTML body of the email (optional).
 * @returns {Promise<void>}
 */
const sendEmail = async (to, subject, text, html) => {
  const msg = {
    from: config.email.from,
    to,
    subject,
    text,
    html,
  };

  await transporter.sendMail(msg);
  logger.info(`Email sent to ${to} with subject "${subject}"`);
};

module.exports = {
  sendEmail,
};
