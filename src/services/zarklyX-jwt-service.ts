import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { promisify } from "util";

export interface ZarklyXJwtPayload extends JwtPayload {
  id: string;
  email: string;
  roleId: string;
  department?: string;
}

/**
 * Separate JWT secret for ZarklyX internal users
 * IMPORTANT: Use a different secret from company users for security isolation
 */
const ZARKLYX_JWT_SECRET = process.env.ZARKLYX_JWT_SECRET || "zarklyx_platform_admin_secret_2025";

/**
 * Generate JWT token for ZarklyX user
 */
export const generateZarklyXToken = async (
  payload: ZarklyXJwtPayload,
  expireTime?: string
): Promise<string> => {
  const signSync = promisify(jwt.sign);
  
  //@ts-ignore
  const token = await signSync(payload, ZARKLYX_JWT_SECRET, {
    expiresIn: expireTime || "24h",
  }) as string;
  
  return token;
};

/**
 * Verify ZarklyX JWT token
 */
export const verifyZarklyXToken = (token: string): ZarklyXJwtPayload | null => {
  try {
    const decoded = jwt.verify(token, ZARKLYX_JWT_SECRET) as ZarklyXJwtPayload;
    return decoded;
  } catch (error) {
    console.error("❌ ZarklyX token verification error:", error);
    return null;
  }
};

/**
 * Check ZarklyX token validity
 */
export const checkZarklyXTokenValidity = (token: string): boolean => {
  if (!token) return false;
  
  try {
    jwt.verify(token, ZARKLYX_JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
};
