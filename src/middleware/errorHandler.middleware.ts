import { NextFunction, Request, Response } from "express";
import { serverError } from "../utils/responseHandler"; 
import ErrorLogger from "../db/core/logger/error-logger";

// const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
//     console.error("Error:", err);
//     res.status(500).json({ message: "Internal Server Error" });
// };

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    ErrorLogger.write(err);
    console.log(res);

    serverError(res, err);
};

export default errorHandler;

