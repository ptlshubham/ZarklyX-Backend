// src/types/express/index.d.ts
import { Request } from "express";
// import { File } from "multer";

declare module 'express-serve-static-core' {
  interface Request {
    file?: Express.Multer.File;
    files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
    session?: Record<string, any>;
  }
}
