import express from "express";
import { sendEncryptedResponse, serverError } from "../../../utils/responseHandler";
import { sendOTP } from "../../../services/otp-service";

const router = express.Router();

// Minimal SMS OTP API - sends an OTP via MSG91 using env-driven config
router.post("/sms-otp", async (req: any, res: any) => {
  try {
    const { contact, mbOTP, type = "register" } = req.body || {};

    if (!contact || !mbOTP) {
      serverError(res, "contact and mbOTP are required");
      return;
    }

    const result = await sendOTP({ contact, mbOTP }, type);
    if (result?.success) {
      sendEncryptedResponse(res, true, "OTP sent successfully");
      return;
    }

    serverError(res, result?.message || "Failed to send OTP");
  } catch (error: any) {
    serverError(res, error?.message || "Unexpected error sending OTP");
  }
});

module.exports = router;
// SENDER_EMAIL_PASSWORD: "Proses@1412!2024",