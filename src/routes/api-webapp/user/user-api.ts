import express from "express";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { other, notFound } from "../../../services/response"
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";

import { User } from "./user-model";


const router = express.Router();
// type Params = { id: string };

module.exports = router;