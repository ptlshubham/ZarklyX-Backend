
import { Response } from "express";
import crypto from "crypto";
import {
  encryptObject,
  decryptToObject,
  decryptFromToken,
} from "../services/encryptDecrypt-service";
 
/* ------------------------------------------------------------------
   AES ENCRYPTION (same logic as your encryptDecrypt-service legacy)
------------------------------------------------------------------- */
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(String("your-secret-key"))
  .digest("base64")
  .substr(0, 32); // 32 bytes key

// Encrypt JSON response payload
const encryptData = (data: any) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);

  let encrypted = cipher.update(JSON.stringify(data));
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return {
    iv: iv.toString("hex"),
    encryptedData: encrypted.toString("hex"),
  };
};

/* ------------------------------------------------------------------
   TYPES
------------------------------------------------------------------- */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T | null;
  error?: string | null;
}

/* ------------------------------------------------------------------
   NORMAL API RESPONSES
------------------------------------------------------------------- */
export const successResponse = <T>(
  res: Response,
  message: string,
  data: T | null = null
) => {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (
  res: Response,
  message: string,
  error: string | null = null,
  statusCode: number = 400
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error,
  });
};

export const alreadyExist = (res: Response, message: string) => {
  return res.status(409).json({
    success: false,
    message,
    error: message,
  });
};

export const serverError = (
  res: Response,
  message: string,
  error: string | null = null,
  statusCode: number = 500
) => {
  return res.status(statusCode).json({
    success: false,
    message: message || "Internal Server Error",
    error,
  });
};

export const unauthorized = (
  res: Response,
  message: string,
  statusCode: number = 401
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
  });
};

/* ------------------------------------------------------------------
   ENCRYPTED RESPONSE (main function for your mobile/web app)
------------------------------------------------------------------- */
export const sendEncryptedResponse = (
  res: Response,
  data: any,
  message: string = "Success"
) => {
  try {
    const encrypted = encryptData(data);
    return res.status(200).json({
      success: true,
      message,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
    });
  } catch (err: any) {
    console.error("Encryption Error:", err);
    return serverError(res, "Failed to encrypt response", err?.message);
  }
};

/* ------------------------------------------------------------------
   OPTIONAL (both encrypted & normal use)
------------------------------------------------------------------- */
export const sendEncryptedOrPlain = (
  res: Response,
  data: any,
  message: string = "Success",
  encrypt: boolean = true
) => {
  if (encrypt) return sendEncryptedResponse(res, data, message);
  return successResponse(res, message, data);
};

/* ------------------------------------------------------------------
   SUCCESS FOR SOME OLD APIs
------------------------------------------------------------------- */
export const success = (res: Response, data: any, msg: string) => {
  return res.status(200).json({
    success: true,
    message: msg,
    data,
  });
};

export const other = (
  res: Response,
  statusCode: number = 200,
  message: string = "Custom Response",
  data: any = null
) => {
  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    data,
  });
};


