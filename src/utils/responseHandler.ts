
import { Response } from "express";
import crypto from "crypto";

  // Custom encryption key and IV 
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String("your-secret-key")).digest('base64').substr(0, 32); // 32 bytes key
const IV = crypto.randomBytes(16); //  IV (Initialization Vector)

// AES Encryption
const encryptData = (data: any) => {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), IV);
  let encrypted = cipher.update(JSON.stringify(data));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    iv: IV.toString("hex"),
    encryptedData: encrypted.toString("hex")
  };
};

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T | null;
    error?: string | null;
}

// Success Response
export const successResponse = <T>(res: any, message: string, data: T | null = null): any => {
    return res.status(200).json({
        success: true,
        message,
        data,
    });
};

// Error Response
export const errorResponse = (res: any, message: string, error: string | null = null, statusCode: number = 400): any => {
    return res.status(statusCode).json({
        success: false,
        message,
        error,
    });
};

// Already Exists Response (409 Conflict)
export const alreadyExist = (res: any, message: string): any => {
    return res.status(409).json({
        success: false,
        message,
        error: message,  // Fix: Dynamic error message instead of generic "Resource already exists"
    });
};

// Server Error Response (500 Internal Server Error)
export const serverError = (res: any, message: string, error: string | null = null, statusCode: number = 500): any => {
    return res.status(statusCode).json({
        success: false,
        message: message || "Internal server error",
        error,
    });
};

//unauthoorized response (401)
export const unauthorized = (res: Response, message: string, statusCode: number = 401) => {
    return res.status(statusCode).json({
      success: false,
      message,
      data: null
    });
  };

  //Encrypted Response
  export const sendEncryptedResponse = (res: Response, data: any, message: string = "Success") => {
    const encrypted = encryptData(data);
    return res.status(200).json({
      success: true,
      message,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv
    });
  };

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
      data
    });
  };
  

