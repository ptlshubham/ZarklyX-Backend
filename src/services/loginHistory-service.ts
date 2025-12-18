import { Request } from "express";
import { LoginHistory } from "../routes/api-webapp/loginHistory/loginHistory-model";
import crypto from "crypto";

/**
 * Extract device information from user agent
 */
export const getDeviceInfo = (userAgent: string | undefined) => {
  if (!userAgent) {
    return {
      browser: null,
      os: null,
      device: null,
      userAgent: null,
    };
  }

  try {
    // Simple user agent parsing without ua-parser-js
    // This is a basic implementation
    const isMobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);
    const isTablet = /tablet|ipad|kindle/i.test(userAgent);
    const browserMatch = userAgent.match(/(Firefox|Chrome|Safari|Edge|Opera|MSIE|Trident(?=\/))\/?\s*(\d+)/);
    const osMatch = userAgent.match(/(Windows|Mac|Linux|Android|iOS|iPhone|iPad)/);

    const browser = browserMatch ? browserMatch[1] : null;
    const os = osMatch ? osMatch[1] : null;
    const device = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

    return {
      browser,
      os,
      device,
      userAgent,
    };
  } catch (error) {
    console.error("Error parsing user agent:", error);
    return {
      browser: null,
      os: null,
      device: null,
      userAgent: userAgent,
    };
  }
};

/**
 * Get IP address from request
 */
export const getIpAddress = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return (
    (req.socket?.remoteAddress as string) ||
    req.connection?.remoteAddress ||
    "0.0.0.0"
  );
};

/**
 * Generate a unique session ID
 */
export const generateSessionId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * Create a login history record with retry logic
 */
export const createLoginHistory = async (
  userId: string,
  loginType: "GOOGLE" | "APPLE" | "OTP" | "PASSWORD",
  req: Request,
  token?: string,
  status: "SUCCESS" | "FAILED" = "SUCCESS",
  failReason?: string,
  retries: number = 3,
  delay: number = 500
) => {
  try {
    const sessionId = generateSessionId();
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"];
    const deviceInfo = getDeviceInfo(userAgent);

    const loginHistoryData = {
      userId,
      sessionId,
      tokenId: token || null,
      loginTime: new Date(),
      logoutTime: null,
      ipAddress,
      device: deviceInfo.device,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      userAgent: deviceInfo.userAgent,
      location: null,
      loginType,
      status,
      failReason: failReason || null,
    };

    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const loginHistory = await LoginHistory.create(loginHistoryData as any);
        return {
          success: true,
          sessionId: loginHistory.sessionId,
          loginHistoryId: loginHistory.id,
          data: loginHistory,
        };
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a lock timeout error
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < retries) {
          console.log(`[LoginHistory] Lock timeout, retry ${attempt}/${retries-1}...`);
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
        
        // Not a lock timeout or final attempt - throw error
        break;
      }
    }
    
    // All retries failed
    console.error("Error creating login history after retries:", lastError);
    return {
      success: false,
      error: lastError,
    };
  } catch (error) {
    console.error("Error creating login history:", error);
    return {
      success: false,
      error: error,
    };
  }
};

/**
 * Record failed login attempt with retry logic
 */
export const recordFailedLogin = async (
  userId: string | null,
  loginType: "GOOGLE" | "APPLE" | "OTP" | "PASSWORD",
  req: Request,
  failReason: string,
  retries: number = 2,
  delay: number = 300
) => {
  try {
    // Only record if userId is provided (if available)
    if (!userId) return;

    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"];
    const deviceInfo = getDeviceInfo(userAgent);

    const failedLoginData = {
      userId,
      sessionId: generateSessionId(),
      tokenId: null,
      loginTime: new Date(),
      logoutTime: null,
      ipAddress,
      device: deviceInfo.device,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      userAgent: deviceInfo.userAgent,
      location: null,
      loginType,
      status: "FAILED",
      failReason: failReason,
    };

    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await LoginHistory.create(failedLoginData as any);
        return { success: true };
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a lock timeout error
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < retries) {
          console.log(`[LoginHistory] Failed login lock timeout, retry ${attempt}/${retries-1}...`);
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
        
        // Not a lock timeout or final attempt
        break;
      }
    }
    
    // Log error but don't throw - failed login recording should not break the flow
    console.error("Error recording failed login:", lastError);
  } catch (error) {
    console.error("Error recording failed login:", error);
  }
};

/**
 * Update login history with logout time
 */
export const updateLogoutTime = async (
  sessionId: string,
  logoutTime: Date = new Date()
) => {
  try {
    const loginHistory = await LoginHistory.findOne({
      where: { sessionId },
    });

    if (!loginHistory) {
      return { success: false, message: "Session not found" };
    }

    await loginHistory.update({ logoutTime });
    return { success: true, data: loginHistory };
  } catch (error) {
    console.error("Error updating logout time:", error);
    return { success: false, error };
  }
};

/**
 * Get login history for a user
 */
export const getUserLoginHistory = async (
  userId: string,
  limit: number = 20,
  offset: number = 0
) => {
  try {
    const { count, rows } = await LoginHistory.findAndCountAll({
      where: { userId },
      order: [["loginTime", "DESC"]],
      limit,
      offset,
    });

    return { success: true, count, data: rows };
  } catch (error) {
    console.error("Error fetching login history:", error);
    return { success: false, error };
  }
};

/**
 * Get active sessions for a user
 */
export const getUserActiveSessions = async (userId: string) => {
  try {
    const sessions = await LoginHistory.findAll({
      where: {
        userId,
        logoutTime: null,
        status: "SUCCESS",
      },
      order: [["loginTime", "DESC"]],
    });

    return { success: true, data: sessions };
  } catch (error) {
    console.error("Error fetching active sessions:", error);
    return { success: false, error };
  }
};
