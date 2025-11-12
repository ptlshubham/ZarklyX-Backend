import { ProfileInfoUp, DocumentUpload } from "../../../services/multer";
import express from "express";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import {
  alreadyExist,
  serverError,
  unauthorized,
} from "../../../utils/responseHandler";
import { other, notFound } from "../../../services/response"
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import dbInstance from "../../../db/core/control-db";
import ErrorLogger from "../../../db/core/logger/error-logger";
import { sendEmail } from "../../../services/mailService";
import { generateToken } from "../../../services/jwtToken-service";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import {
  updateCustomerFromApp,
  handleAddDriverDocuments
} from "./settings-handler";
import { Router } from 'express';
const router = express.Router();

//to get profile info
// router.get("/getProfileInfo", tokenMiddleWare, async (req: any, res) => {
//     try {
//       let profileInfo: any = await getUserByid({ id: req.user.id });
//       profileInfo = JSON.parse(JSON.stringify(profileInfo));
//       let getActivePlan: any = await findCustomerPlan(req.user.id);

//       if (!getActivePlan) {
//         profileInfo.isActivePlan = false;
//       } else {
//         profileInfo.isActivePlan = true;
//       }

//       delete profileInfo?.password;
//       delete profileInfo?.createdBy;
//       delete profileInfo?.modifiedBy;
//       delete profileInfo?.createdAt;
//       delete profileInfo?.updatedAt;
//       sendEncryptedResponse(res, profileInfo, "Get profile info!!!");
//       // success(res, profileInfo, "Get profile info!!!");
//     } catch (error) {
//       ErrorLogger.write({ type: "profile info error", error });
//       serverError(res, error);
//     }
//   });

router.post(
  "/addDriverDocuments",
  DocumentUpload.fields([
    // { name: "aadharImg" },
    // { name: "drivingLicenseImg" },
    // { name: "passportImg" },
     { name: "aadharFrontImg" },
    { name: "aadharBackImg" },
    { name: "drivingLicenseFrontImg" },
    { name: "drivingLicenseBackImg" },
    { name: "passportPhoto" },
  ]),
  async (req: any, res: any) => {
    const t = await dbInstance.transaction();
    try {
      let parsedData = req.body.formData ? JSON.parse(req.body.formData) : {};

      // if (req.files.aadharImg) {
      //   parsedData.aadharImg = req.files.aadharImg[0].filename;
      // }
      // if (req.files.drivingLicenseImg) {
      //   parsedData.drivingLicenseImg = req.files.drivingLicenseImg[0].filename;
      // }
         if (req.files?.aadharFrontImg?.[0]) {
        parsedData.aadharFrontImg = req.files.aadharFrontImg[0].filename;
      }
      if (req.files?.aadharBackImg?.[0]) {
        parsedData.aadharBackImg = req.files.aadharBackImg[0].filename;
      }

      if (req.files?.drivingLicenseFrontImg?.[0]) {
        parsedData.drivingLicenseFrontImg = req.files.drivingLicenseFrontImg[0].filename;
      }
      if (req.files?.drivingLicenseBackImg?.[0]) {
        parsedData.drivingLicenseBackImg = req.files.drivingLicenseBackImg[0].filename;
      }
      if (req.files.passportPhoto) {
        parsedData.passportPhoto = req.files.passportPhoto[0].filename;
      }

      console.log("Final Parsed Data to Save:", parsedData);

      const dummyUserId = 32;
      const saved = await handleAddDriverDocuments(parsedData, dummyUserId, t);
       console.log("Saved successfully:", saved);
      // const saved = await handleAddDriverDocuments(parsedData, req.user.id, t);
      await t.commit();
      sendEncryptedResponse(res, saved, "Documents uploaded successfully");
    } catch (error) {
      await t.rollback();
      serverError(res, (error as Error).message || "An unexpected error occurred");
    }
  }
);

//to update profile info
router.put("/updateDriverDocumentInfo",
  tokenMiddleWare,
  ProfileInfoUp.fields([
    // { name: "panCardImg" },
    // { name: "addressProofImg" },
    // { name: "aggDoc" },
    { name: "aadharFrontImg" },
    { name: "aadharBackImg" },
    { name: "drivingLicenseFrontImg" },
    { name: "drivingLicenseBackImg" },
    { name: "passportPhoto" },
  ]),
  async (req: any, res: any) => {
    let t = await dbInstance.transaction();
    try {
      let parsedData = req.body.formData ? JSON.parse(req.body.formData) : {};

      if (req.files.panCardImg) {
        parsedData.panCardImg = req.files.panCardImg[0].filename;
      }
      if (req.files.aadharFrontImg) {
        parsedData.aadharFrontImg = req.files.aadharFrontImg[0].filename;
      }
      if (req.files.aadharBackImg) {
        parsedData.aadharBackImg = req.files.aadharBackImg[0].filename;
      }
      if (req.files.drivingLicenseFrontImg) {
        parsedData.drivingLicenseFrontImg = req.files.drivingLicenseFrontImg[0].filename;
      }
        if (req.files.drivingLicenseBackImg) {
        parsedData.drivingLicenseBackImg = req.files.drivingLicenseBackImg[0].filename;
      }
      if (req.files.passportPhoto) {
        parsedData.passportPhoto = req.files.passportPhoto[0].filename;
      }
      // if (req.files.aggDoc) {
      //   parsedData.aggDoc = req.files.aggDoc[0].filename;
      // }

      parsedData.isProfileCompleted = 1;

      let updateDriverDocumentInfo: any = await updateCustomerFromApp(parsedData, { id: req.user.id }, t);
      await t.commit();
      sendEncryptedResponse(res, updateDriverDocumentInfo, "Data updated successfully");
      // success(res, updateDriverDocumentInfo, "Data updated successfully!!!!");
    } catch (error) {
      ErrorLogger.write({ type: "updateDriverDocumentInfo error", error });
      await t.rollback();
      serverError(res, (error as Error).message || "An unexpected error occurred");
    }
  }
);

module.exports = router;