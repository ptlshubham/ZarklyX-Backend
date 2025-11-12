import bcrypt from "bcryptjs";
import { Settings } from "../../../routes/api-app/settings/settings-model"; // Ensure correct import
import { Op ,Transaction} from "sequelize";
const { MakeQuery, } = require("../../../services/model-service");
import axios from "axios";
import { DocumentPayload } from '../../../types/settings.types';

console.log(Settings);


// export interface DocumentPayload {
//   name?: string;
//   dlNumber?: string;
//   addressProofId?: string;
//   addressProofImg?: string;
//   aadharFrontImg?: string;
//   aadharBackImg?: string;
//   drivingLicenseFrontImg?: string;
//   drivingLicenseBackImg?: string;
//   passportPhoto?: string;
//   driverId: number;
//   [key: string]: any; // if you want to allow others dynamically
// }

//for update Settings
export const updateCustomerFromApp = (body: any, params: any, t: any) => {
    return Settings.update(body, {
      where: { id: params.id },
      transaction: t,
    });
  };


export const handleAddDriverDocuments = async (
  data: DocumentPayload,
  driverId: number,
  transaction: any
) => {
  // Remove undefined properties to satisfy model requirements
  const payload: any = {
    ...data,
    isDeleted: false,
    isEmailVerified: false,
    isMobileVerified: false,
    isActive: true,
  };

  Object.keys(payload).forEach(
    (key) => payload[key] === undefined && delete payload[key]
  );

  return await Settings.create(payload, { transaction });
};



 export const addDriverDocuments = async (data: any, transaction: any) => {
  return await Settings.create(data, { transaction });
};