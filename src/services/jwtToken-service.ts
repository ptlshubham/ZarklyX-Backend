import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { inActive, notFound, unauthorized } from "../services/response";
// import { unauthorized } from "../utils/responseHandler"
import { promisify } from "util";
import { GLOBAL_CONSTANTS } from "../utils/constants";
import { Request, Response, NextFunction } from "express";
import { User } from "../db/core/init-control-db";

import dbInstance from "../db/core/control-db";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}
export interface AuthJwtPayload extends JwtPayload {
  id: string;
  email: string;
  contact: string;
  companyId: string;
}

// Extend the Request interface to include the user property
// declare global {
//   namespace Express {
//     interface Request {
//       user?: any;
//     }
//   }
// }

// export const tokenMiddleWare = async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     const token = req.header("authorization");

//     if (!token) {
//       return unauthorized(res, "Token not provided");
//     }

//     const decoded = jwt.verify(token, GLOBAL_CONSTANTS.token);

//     // @ts-ignore
//     req.user = decoded;
//     next();
//   } catch (error: any) {
//     console.error("Token verification error:", error.message);
//     return unauthorized(res, "Token expired or invalid");
//   }
// };





// export const generateToken = (
//   payload: any,
//   expireTime: jwt.SignOptions['expiresIn'] = '24h'
// ): Promise<string> => {
//   return new Promise((resolve, reject) => {
//     const options: SignOptions = {
//       expiresIn: expireTime,
//     };

//     jwt.sign(payload, GLOBAL_CONSTANTS.token, options, (err, token) => {
//       if (err || !token) {
//         reject(err);
//       } else {
//         resolve(token as string);
//       }
//     });
//   });
// };


// export const checkTokenValidity = (token: string) => {
//   if (!token) return false;
//   return jwt.verify(token, GLOBAL_CONSTANTS.token, function (err: any, decoded: any) {
//     if (err) return false;
//     return decoded;
//   });

// };




// verify token
export const tokenMiddleWare = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // const t = await dbInstance.transaction();
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      unauthorized(res, "Invalid token");
      return;
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, GLOBAL_CONSTANTS.token) as AuthJwtPayload;

    const user = await User.findByPk(decoded.id);

    if (!user) {
      // await t.rollback();
      notFound(res, "User not found");
      return;
    }

    if (user.isActive === false) {
      // await t.rollback();
      inActive(res, "Access forbidden", 403);
      return;
    }

    // @ts-ignore
    req.user = user;

    next();
  } catch (error) {
    console.error("❌ Token error:", error);
    res.status(401).json({
      success: false,
      message: "Token expired or invalid",
    });
    return;
  }
};

export const generateToken = async (payload: any, expireTime?: string) => {
  let signSync = promisify(jwt.sign);
  //@ts-ignore
  let token = await signSync(payload, GLOBAL_CONSTANTS.token, { expiresIn: expireTime || "24h" });
  return token
};

export const checkTokenValidity = (token: string) => {
  if (!token) return false;
  return jwt.verify(token, GLOBAL_CONSTANTS.token, function (err: any, decoded: any) {
    if (err) return false;
    return decoded;
  });

};