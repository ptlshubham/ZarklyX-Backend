// const axios = require('axios');
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import configs from "../../../../src/config/config";
import environment from "../../../../environment";
// import { updateCustomerByEmail } from '../customer-master/customer-master-handler';
import { Transaction } from 'sequelize';
const config = (configs as { [key: string]: any })[environment];

export const sendOTPTest = async (mobileNumber: any, otp: any) => {
    const API_KEY = '446606Apuh307kK692fd83cP1';
    const TEMPLATE_ID = '692fdcfe3f1ffe1f51020c26';
    const COUNTRY_CODE = '91';

    const data = {
        template_id: TEMPLATE_ID,
        realTimeResponse: 1,
        short_url: '1',
        recipients: [{
            "mobiles": `${COUNTRY_CODE}${mobileNumber}`,
            "var": otp,
        }],
    };

    try {
        const response = await axios.post(`https://control.msg91.com/api/v5/flow`, data, {
            headers: {
                'authkey': API_KEY,
                'accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        // console.log('OTP sent successfully:', response);
    } catch (error: any) {
        console.error('Error sending OTP:', error);
    }
};

// export const downloadFileToServer = async (payload: any, t: Transaction) => {
//     // return
//     try {
//         let fileUrl: any = null;
//         let fileName = '';
//         for (const obj of payload) {
//             for (const [key, value] of Object.entries(obj)) {
//                 if (key !== 'email') {
//                     let element: any = processKeyValue(key, obj[key]);
//                     element = JSON.parse(element);

//                     if (element.aggDoc) {
//                         fileUrl = element.aggDoc;
//                         fileName = 'Agreement';
//                     } else if (element.passportPhoto) {
//                         fileUrl = element.passportPhoto;
//                         fileName = 'PassportPhoto';
//                     } else if (element.addressProofImg) {
//                         fileUrl = element.addressProofImg;
//                         fileName = 'AddressProof';
//                     } else if (element.panCardImg) {
//                         fileUrl = element.panCardImg;
//                         fileName = 'PanCard';
//                     } else if (element.aadharBackImg) {
//                         fileUrl = element.aadharBackImg;
//                         fileName = 'AadhaarBack';
//                     } else if (element.aadharFrontImg) {
//                         fileUrl = element.aadharFrontImg;
//                         fileName = 'AadhaarFront';
//                     }

//                     let setFileName: any = null;

//                     if (fileUrl !== null) {
//                         setFileName = `${Date.now()}-${fileName}.jpeg`;
//                         let savePath = path.join(`${config.publicPath}/profileFile`, setFileName);
//                         await downloadFile(fileUrl, savePath);
//                     }

//                     try {
//                         obj[key] = setFileName;
//                     } catch (error) {
//                         console.log(error, "EEEEEEEEE");
//                     }
//                 }
//             }
//             await updateCustomerByEmail(obj, obj.email, t);
//         }
//     } catch (error: any) {
//         console.error('Error downloading or saving file:', error.message);
//     }
// }

// const processKeyValue = (key: any, value: any) => {
//     return `{"${key}": "${value}"}`;
// }

// const downloadFile = async (url: any, filePath: any) => {
//     const response = await axios({
//         url,
//         method: 'GET',
//         responseType: 'stream',
//     });

//     return new Promise((resolve, reject) => {
//         const writer = fs.createWriteStream(filePath);
//         response.data.pipe(writer);

//         writer.on('finish', resolve);
//         writer.on('error', reject);
//     });
// }