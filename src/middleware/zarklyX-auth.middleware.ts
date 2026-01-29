import { Request, Response, NextFunction } from "express";
import { verifyZarklyXToken } from "../services/zarklyX-jwt-service";
import { ZarklyXUser } from "../routes/api-webapp/superAdmin/authentication/user/user-model";

// Extend Express Request type to include zarklyXUser
declare module "express-serve-static-core" {
  interface Request {
    zarklyXUser?: ZarklyXUser;
  }
}

/**
 * Middleware to authenticate ZarklyX internal users
 * Verifies JWT token and sets req.zarklyXUser
 */
export const zarklyXAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Invalid ZarklyX authorization token",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyZarklyXToken(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        message: "ZarklyX token expired or invalid",
      });
      return;
    }

    // Fetch user from database
    const user = await ZarklyXUser.findByPk(decoded.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "ZarklyX user not found",
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "ZarklyX account is inactive",
      });
      return;
    }

    if (user.isDeleted) {
      res.status(403).json({
        success: false,
        message: "ZarklyX account has been deleted",
      });
      return;
    }

    // Set user on request object
    req.zarklyXUser = user;

    next();
  } catch (error) {
    console.error("❌ ZarklyX auth error:", error);
    res.status(401).json({
      success: false,
      message: "ZarklyX authentication failed",
    });
    return;
  }
};
