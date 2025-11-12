import jwt, { JwtPayload, SignOptions  } from "jsonwebtoken";
import { unauthorized } from "../services/response";
// import { unauthorized } from "../utils/responseHandler"
import { promisify } from "util";
import { GLOBAL_CONSTANTS } from "../utils/constants";
import { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: string | JwtPayload;
  }
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
export const tokenMiddleWare = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.header("authorization");

    if (!token) {
      unauthorized(res, "Invalid token");
      return;
    }

    const decoded: string | JwtPayload = jwt.verify(token, GLOBAL_CONSTANTS.token);

    // @ts-ignore
    req.user = decoded;

    next();
  } catch (error) {
    unauthorized(res, "Token expired");
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
  return jwt.verify(token, GLOBAL_CONSTANTS.token, function (err:any, decoded:any) {
    if (err) return false;    
    return decoded;
  });

};