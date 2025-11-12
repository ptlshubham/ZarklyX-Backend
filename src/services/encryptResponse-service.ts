import { success } from "../utils/responseHandler";
import { encryptData } from "./encryptDecrypt-service";
import { Response } from "express";

export const sendEncryptedResponse = async (res: Response, data: any, msg: string) => {
    // req.logger.info(
    //   `[${req.route.path}, ${stringifyMethod(req.route.methods)}][${currentTime}], ${msg}`
    // );
    let encryptedData = await encryptData(data);
    return success(res, encryptedData, msg)
  };