import express from "express";
import { Request, Response } from "express";
import * as speakeasy from "speakeasy";
import dbInstance from "../../../../db/core/control-db";
import { Clients } from "./clients-model";
import { serverError, unauthorized } from "../../../../utils/responseHandler";
import { generateToken } from "../../../../services/jwtToken-service";
import ErrorLogger from "../../../../db/core/logger/error-logger";

const router = express.Router();


export default router;
