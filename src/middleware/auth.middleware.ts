import { Request, Response, NextFunction } from "express";
import { tokenMiddleWare } from "../services/jwtToken-service";

/**
 * Authentication middleware
 * Verifies JWT token from authorization header
 * Attaches user information to request object
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  tokenMiddleWare(req, res, next);
};

/**
 * Optional authentication middleware
 * Verifies JWT token if provided, but doesn't block if missing
 */
export const optionalAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header("authorization");
    
    if (!token) {
      // Token not provided, continue without user
      return next();
    }

    const jwt = require("jsonwebtoken");
    const { GLOBAL_CONSTANTS } = require("../utils/constants");
    
    const decoded = jwt.verify(token, GLOBAL_CONSTANTS.token);
    // @ts-ignore
    req.user = decoded;
    next();
  } catch (error) {
    // Token verification failed, continue without user
    next();
  }
};
