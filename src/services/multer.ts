
import multer from "multer";
// const multer = require("multer");
const images = "/public/cluster";
const excelFiles = "/excelFiles";
const schoolImg = "../public/schoolImg";
const removeInitSlash = (str: string) => {
  return str.substring(1);
};

import { Request } from "express";
import configs from "../config/config";
import environment from "../../environment";
const config = (configs as { [key: string]: any })[environment];
import fs from "fs";


const profileFile = "profileFile";



const getFileStorage = (path: string) => {
  return multer.diskStorage({
    destination: function (req: Request, file: any, cb: any) {
      const uploadPath = `/${config.publicPath}/${path}`;
      cb(null, process.cwd() + uploadPath);
    },
    filename: function (req: Request, file: any, cb: any) {
      var d = new Date();
      cb(null, `${Date.now()}-${file.originalname.replace(/ /g,"_")}`);
    },
  });
};


const getProfileFileStorage = (path: string) => {
  return multer.diskStorage({
    destination: function (req: Request, file: any, cb: any) {
      const uploadPath = `/${config.publicPath}/${path}`;
      if (!fs.existsSync(`.${uploadPath}`)) {
        fs.mkdirSync(`.${uploadPath}`);
      }
      cb(null, process.cwd() + uploadPath);
    },
    filename: function (req: any, file: any, cb: any) {

      const fileName = setFileName(file);
      const fileExtension = setFileExtension(file);

      cb(null, `${Date.now()}-${fileName}.${fileExtension}`);
    },
  });
};

// const imageFilter = function (req: Request, file: any, cb: any) {
//   // accept image only
//   if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/)) {
//     return cb(new Error("Only image files are allowed!"), false);
//   }
//   cb(null, true);
// };

// const audioFilter = function (req: any, file: any, cb: any) {
//   // accept audio only
//   if (!file.originalname.match(/\.(mp3|wav|ogg)$/)) {
//     return cb(new Error("Only valid audio files are allowed!"), false);
//   }
//   cb(null, true);
// };

// const blobFilter = function (req: any, file: any, cb: any) {
//   // accept audio only
//   if (file.originalname.match('blob')) {
//     return cb(null, false);
//   }
//   cb(null, true);
// };

const excelFilter = function (req: Request, file: any, cb: any) {
  // accept image only
  if (!file.originalname.match(/\.(xlsx)$/)) {
    return cb(new Error("Only excel files are allowed!"), false);
  }
  cb(null, true);
};

const imageFilter = function (req: Request, file: any, cb: any) {
  // accept image only
  if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/)) {
    return cb(new Error("Only image files are allowed!"), false);
  }
  cb(null, true);
};

const profileFileFilter = function (req: Request, file: any, cb: any) {
  // accept image only
  if (!file.originalname.match(/\.(jpg|jpeg|png|pdf)$/)) {
    return cb(new Error("Only image and pdf file format are allowed!"), false);
  }
  cb(null, true);
};

// export const imageUpload = multer({
//   storage: getFileStorage(images),
//   fileFilter: imageFilter,
// });

export const excelUpload = multer({
  storage: getFileStorage(excelFiles),
  fileFilter: excelFilter,
});

export const imgUpload = multer({
  storage: getFileStorage(schoolImg),
  fileFilter: imageFilter,
});



export const ProfileInfoUp = multer({
  storage: getProfileFileStorage(profileFile),
  // fileFilter: profileFileFilter,
});

export const DocumentUpload = multer({
  storage: getProfileFileStorage(profileFile),
  // fileFilter: profileFileFilter,
});

//---------------------------------------------Other----------------------------------------------//

const setFileName = (file: any) => {

  let fileName = '';

  switch (file.fieldname) {
       case 'profile_image':  // Rinkal - Registration with profile img
      fileName = 'ProfilePic';
      break;
    case 'panCardImg':
      fileName = 'PanCard';
      break;
    case 'aadharFrontImg':
      fileName = 'AadhaarFront';
      break;
    case 'aadharBackImg':
      fileName = 'AadhaarBack';
      break;
       case 'drivingLicenseFrontImg':
      fileName = 'DrivingLicenseFront';
      break;
    case 'drivingLicenseBackImg':
      fileName = 'DrivingLicenseBack';
      break;
    // case 'addressProofImg':
    //   fileName = 'AddressProof';
    //   break;
    case 'passportPhoto':
      fileName = 'PassportPhoto';
      break;
    case 'aggDoc':
      fileName = 'Agreement';
      break;
    default:
      fileName = 'file';
      break;
  }

  return fileName;
};

const setFileExtension = (file: any) => {

  let extension = '';

  switch (file.mimetype) {
    case 'application/pdf':
      extension = 'pdf';
      break;
    case 'image/png':
      extension = 'png';
      break;
    case 'image/jpeg':
      extension = 'jpeg';
      break;
    default:
        extension = 'jpg';
      break;
  }

  return extension;
};