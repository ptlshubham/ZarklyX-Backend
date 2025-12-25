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
// export const tokenMiddleWare = (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): void => {
//   try {
//     const token = req.header("authorization");

//     if (!token) {
//       unauthorized(res, "Invalid token");
//       return;
//     }

//     const decoded: string | JwtPayload = jwt.verify(token, GLOBAL_CONSTANTS.token);

//     // @ts-ignore
//     req.user = decoded;

//     next();
//   } catch (error) {
//     unauthorized(res, "Token expired");
//     return;
//   }
// };

export const tokenMiddleWare = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    console.log("➡️ tokenMiddleWare called");

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authorization token missing",
      });
      return;
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, GLOBAL_CONSTANTS.token);

    (req as any).user = decoded;

    console.log("✅ Token decoded:", decoded);

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


//working code for tokenmiddleware
// export const tokenMiddleWare = (
//   req: Request & { user?: any },
//   res: Response,
//   next: NextFunction
// ): void => {
//   try {
//     console.log("➡️ tokenMiddleWare called");

//     const authHeader = req.headers.authorization;

//     if (!authHeader) {
//       console.log("❌ Authorization header missing");
//       unauthorized(res, "Authorization header missing");
//       return;
//     }

//     // Expect: Bearer <token>
//     const parts = authHeader.split(" ");

//     if (parts.length !== 2 || parts[0] !== "Bearer") {
//       console.log("❌ Invalid Authorization format");
//       unauthorized(res, "Invalid Authorization format");
//       return;
//     }

//     const token = parts[1];

//     const decoded = jwt.verify(
//       token,
//       GLOBAL_CONSTANTS.token // JWT_SECRET
//     ) as JwtPayload;

//     console.log("✅ Token decoded:", decoded);

//     req.user = decoded; // 🔥 THIS WAS THE MISSING PART
//     next();
//   } catch (error) {
//     console.error("❌ Token verification failed:", error);
//     unauthorized(res, "Token invalid or expired");
//   }
// };
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