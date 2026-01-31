
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
import path from "path";


const profileFile = "profileFile";

// services/multer.ts

const IT_TICKET_UPLOAD_DIR = "itManagement/itTickets";
const IT_ASSET_UPLOAD_DIR = "itManagement/itAssets";


const itTicketStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadPath = `/${config.publicPath}/${IT_TICKET_UPLOAD_DIR}`;
    if (!fs.existsSync(`.${uploadPath}`)) {
      fs.mkdirSync(`.${uploadPath}`, { recursive: true });
    }
    cb(null, process.cwd() + uploadPath);
  },
  filename(req, file, cb) {
    const unique = file.originalname.replace(/ /g, "_");
    cb(null, `${Date.now()}-${unique}`);
  },
});

export const ticketAttachmentUpload = multer({
  storage: itTicketStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only jpeg/png files allowed"));
    } else {
      cb(null, true);
    }
  },
});

const itAssetStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadPath = `/${config.publicPath}/${IT_ASSET_UPLOAD_DIR}`;
    if (!fs.existsSync(`.${uploadPath}`)) {
      fs.mkdirSync(`.${uploadPath}`, { recursive: true });
    }
    cb(null, process.cwd() + uploadPath);
  },
  filename(req, file, cb) {
    const unique = file.originalname.replace(/ /g, "_");
    cb(null, `${Date.now()}-${unique}`);
  },
});

// Company Assets Storage (Logos and Favicons)
// Files are stored in per-asset folders under the public directory (e.g., /public/company/companyLogoLight)
const COMPANY_ASSET_DIR_MAP: { [key: string]: string } = {
  companyLogoLight: "company/companyLogoLight",
  companyLogoDark: "company/companyLogoDark",
  faviconLight: "company/faviconLight",
  faviconDark: "company/faviconDark",
  employeeLoginBanner: "company/employeeLoginBanner",
  clientLoginBanner: "company/clientLoginBanner",
  clientSignupBanner: "company/clientSignupBanner",
};

const companyAssetsStorage = multer.diskStorage({
  destination(req, file, cb) {
    // assetType can come from URL param (preferred) or body (fallback)
    const assetType = (req.params && (req.params as any).assetType) || req.body?.assetType;
    const dir = (assetType && COMPANY_ASSET_DIR_MAP[assetType]) || "company/assets"; // fallback to old path
    const uploadPath = `/${config.publicPath}/${dir}`;
    if (!fs.existsSync(`.${uploadPath}`)) {
      fs.mkdirSync(`.${uploadPath}`, { recursive: true });
    }
    cb(null, process.cwd() + uploadPath);
  },
  filename(req, file, cb) {
    const unique = file.originalname.replace(/ /g, "_");
    cb(null, `${Date.now()}-${unique}`);
  },
});

export const assetAttachmentUpload = multer({
  storage: itAssetStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only jpeg/png/pdf files allowed"));
    } else {
      cb(null, true);
    }
  },
});

export const companyAssetsUpload = multer({
  storage: companyAssetsStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only jpeg/png/webp/svg files allowed"));
    } else {
      cb(null, true);
    }
  },
});

//filepath conversion helper function
export function convertToRelativePath(files?: Express.Multer.File[]): string[] {
  if (!files || files.length === 0) return [];

  return files.map((file) => {
    const relativePath = path.relative(path.join(process.cwd(), "src", "public"), file.path).replace(/\\/g, "/");
    return `/${relativePath}`;

  });

}
// Export alias for clarity — the storage will choose folder based on the provided :assetType param
export const companyAssetsUploadByType = companyAssetsUpload;

// Employee Profile Photo Storage
// Files are stored in employee/profile folder under the public directory
const employeeProfilePhotoStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadPath = `/${config.publicPath}/employee/profile`;
    if (!fs.existsSync(`.${uploadPath}`)) {
      fs.mkdirSync(`.${uploadPath}`, { recursive: true });
    }
    cb(null, process.cwd() + uploadPath);
  },
  filename(req, file, cb) {
    const fileName = setFileName(file);
    const fileExtension = setFileExtension(file);
    cb(null, `${Date.now()}-${fileName}.${fileExtension}`);
  },
});

export const employeeProfilePhotoUpload = multer({
  storage: employeeProfilePhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only jpeg/png/webp files allowed"));
    } else {
      cb(null, true);
    }
  },
});

// Client Profile Photo Storage
// Files are stored in client/profile folder under the public directory
const clientProfilePhotoStorage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadPath = `/${config.publicPath}/client/profile`;
    if (!fs.existsSync(`.${uploadPath}`)) {
      fs.mkdirSync(`.${uploadPath}`, { recursive: true });
    }
    cb(null, process.cwd() + uploadPath);
  },
  filename(req, file, cb) {
    const fileName = setFileName(file);
    const fileExtension = setFileExtension(file);
    cb(null, `${Date.now()}-${fileName}.${fileExtension}`);
  },
});

export const clientProfilePhotoUpload = multer({
  storage: clientProfilePhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only jpeg/png/webp files allowed"));
    } else {
      cb(null, true);
    }
  },
});

const getFileStorage = (path: string) => {
  return multer.diskStorage({
    destination: function (req: Request, file: any, cb: any) {
      const uploadPath = `/${config.publicPath}/${path}`;
      cb(null, process.cwd() + uploadPath);
    },
    filename: function (req: Request, file: any, cb: any) {
      var d = new Date();
      cb(null, `${Date.now()}-${file.originalname.replace(/ /g, "_")}`);
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
    case 'profilePhoto':  // Employee profile photo
      fileName = 'ProfilePhoto';
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