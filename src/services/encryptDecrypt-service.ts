import configs from "../config/config";
import environment from "../../environment";
const config = (configs as { [key: string]: any })[environment];

// const crypto = require("crypto-js");
// --- crypto-js (legacy encryption for old usages) ---
import cryptoJS from "crypto-js";

// --- Node's built-in crypto (for stronger AES-256-CBC encryption) ---
import * as nodeCrypto from "crypto";

/**
 * Environment variable name to use for encryption key.
 * In production, set a strong random value, e.g.:
 *   export RESPONSE_ENCRYPTION_KEY="a-very-strong-secret"
 */
const ENV_KEY_NAME = "RESPONSE_ENCRYPTION_KEY";

/**
 * Get 32-byte key from env secret (sha256).
 * Falls back to config.cryptoKey if env var not present.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env[ENV_KEY_NAME] || config?.cryptoKey || "";
  if (!secret) {
    console.warn(
      `[encryptDecrypt-service] WARNING: ${ENV_KEY_NAME} not set and config.cryptoKey missing. Using empty fallback key (INSECURE, dev only).`
    );
  }
  return nodeCrypto.createHash("sha256").update(String(secret)).digest(); // 32 bytes
}

/* =========================================================
   NEW – STRONG ENCRYPTION HELPERS (Node crypto)
   ========================================================= */

/**
 * Encrypt an object (or stringifiable data).
 * Returns:
 *  - iv: hex string
 *  - encryptedData: hex string
 *  - token: base64(iv + encrypted)  [convenience single string]
 */
export function encryptObject(data: any): {
  iv: string;
  encryptedData: string;
  token: string;
} {
  const key = getEncryptionKey();
  const iv = nodeCrypto.randomBytes(16); // 16 bytes IV for AES-256-CBC
  const cipher = nodeCrypto.createCipheriv("aes-256-cbc", key, iv);

  const plain = typeof data === "string" ? data : JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plain, "utf8")),
    cipher.final(),
  ]);

  const ivHex = iv.toString("hex");
  const encryptedHex = encrypted.toString("hex");
  const token = Buffer.concat([iv, encrypted]).toString("base64");

  return {
    iv: ivHex,
    encryptedData: encryptedHex,
    token,
  };
}

/**
 * Decrypt given iv (hex) and encryptedData (hex) -> returns parsed object or string.
 * Throws on error.
 */
export function decryptToObject(ivHex: string, encryptedHex: string): any {
  if (!ivHex || !encryptedHex) {
    throw new Error("Invalid inputs for decryptToObject");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = nodeCrypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  const str = decrypted.toString("utf8");

  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Decrypt from token produced by encryptObject (base64(iv + encrypted))
 */
export function decryptFromToken(token: string): any {
  if (!token) throw new Error("Token required");

  const key = getEncryptionKey();
  const buf = Buffer.from(token, "base64");
  if (buf.length <= 16) throw new Error("Invalid token");

  const iv = buf.slice(0, 16);
  const encrypted = buf.slice(16);

  const decipher = nodeCrypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  const str = decrypted.toString("utf8");

  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/* =========================================================
   LEGACY HELPERS (crypto-js) – for backward compatibility
   =========================================================
   These keep your old behaviour exactly:
   encryptData(data) & decryptData(cipherText)
   using config.cryptoKey as string.
*/

/**
 * Legacy encrypt – same behaviour as your original encryptData.
 * Uses crypto-js AES with config.cryptoKey (string).
 */
export const encryptData = (data: any): string => {
  const keyStr = config?.cryptoKey || "";
  const codedData = typeof data === "string" ? data : JSON.stringify(data);
  return cryptoJS.AES.encrypt(codedData, keyStr).toString();
};

/**
 * Legacy decrypt – same behaviour as your original decryptData.
 * Returns the decrypted string (you can JSON.parse it where needed).
 */
export const decryptData = (cipherText: string): string => {
  const keyStr = config?.cryptoKey || "";
  const bytes = cryptoJS.AES.decrypt(cipherText, keyStr);
  const decryptedData = bytes.toString(cryptoJS.enc.Utf8);
  return decryptedData;
};