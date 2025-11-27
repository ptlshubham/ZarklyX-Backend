import axios from 'axios';
import configs from '../config/config';
import environment from '../../environment';
import { GLOBAL_CONSTANTS } from '../utils/constants';
import nodemailer from 'nodemailer';

// Load environment configuration
const config = (configs as { [key: string]: any })[environment];
const COUNTRY_CODE = '91';

// Email configuration from environment
const emailConfig = config.email;
// const transporter = nodemailer.createTransport({
//   host: emailConfig.host,
//   port: emailConfig.port,
//   secure: true, // true for port 465
//   auth: {
//     user: emailConfig.user,
//     pass: emailConfig.pass,
//   },
// });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    // user: "your_current@gmail.com", // your Gmail address 
    // pass: 'your_secure_pass', // replace with your app password 
    user: "br.rinkal1997@gmail.com", // your Gmail address // br.rinkal1997@gmail.com
    pass: 'lhbodchvrstpqmhf', // replace with your app password // dmtz kgzb vadp cdki
  },
});

// Type for OTP args
type otpargs = {
  myMessage: string;
  senderPhone: number;
  dltTemplateId: string;
};

// Function to send OTP via Gupshup (SMS)
export const sendOTP_Gupshup = async (otpargs: otpargs) => {
  const { myMessage, senderPhone, dltTemplateId } = otpargs;
  const password = config.otp?.password; // Ensure this exists in the config file
  const userid = config.otp?.USER_ID;

  if (!password || !userid) {
    throw new Error("OTP configuration missing: Check otp.password and otp.USER_ID in config.");
  }

  const url = `http://enterprise.smsgupshup.com/GatewayAPI/rest?msg=${myMessage}&v=1.1&userid=${userid}&password=${password}&send_to=${senderPhone}&msg_type=text&method=sendMessage&dltTemplateId=${dltTemplateId}`;

  try {
    const response = await axios.post(url);
    return response;
  } catch (error) {
    throw error;
  }
};

// Function to send mobile OTP using MSG91 API
export const sendMobileOTP = async (data: any, type: string): Promise<{ success: boolean; message?: string }> => {
  let payload: any = {
    realTimeResponse: 1,
    short_url: '1',
  };

  if (type === 'register') {
    payload = {
      ...payload,
      template_id: GLOBAL_CONSTANTS.otpTemplateID.register,
      recipients: [
        {
          mobiles: `${COUNTRY_CODE}${data.contact}`,
          var: data.mbOTP,
        },
      ],
    };
  } else if (type === 'login') {
    payload = {
      ...payload,
      template_id: GLOBAL_CONSTANTS.otpTemplateID.login,
      recipients: [
        {
          mobiles: `${COUNTRY_CODE}${data.contact}`,
          var1: data.mbOTP,
        },
      ],
    };
  }

  try {
    await axios.post(`https://control.msg91.com/api/v5/flow`, payload, {
      headers: {
        authkey: '424629ATc4GgIzI66a9d8f9P1',
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending mobile OTP:', error);
    return { success: false, message: 'Failed to send mobile OTP' };
  }
};

// Function to send OTP email
export const sendEmailOTP = async (data: { email: string; otp: number }, type: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const mailOptions = {
      from: emailConfig.user, // Use the configured email from environment
      to: data.email,
      subject: `Your OTP for ZarklyX ${type}`,
      html: `<p>Your OTP for <strong>${type}</strong> is <b>${data.otp}</b>. Do not share this with anyone.</p>`,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending email OTP:', error.message);
    return {
      success: false,
      message: `Failed to send email OTP: ${error.message}`,
    };
  }
};


// General function to send OTP based on type (mobile or email)
export const sendOTP = async (
  data: any,
  type: string
): Promise<{ success: boolean; message?: string }> => {
  console.log("RAW OTP DATA RECEIVED:", data);

  const contact = data.contact || data.contact || data.contact;
  const email = data.email;

  console.log("Extracted mobile:", contact);
  console.log("Extracted email:", email);

  if (contact) {
    return await sendMobileOTP({ contact, mbOTP: data.mbOTP }, type);
  } else if (email) {
    return await sendEmailOTP({ email, otp: data.otp }, type);
  } else {
    throw new Error("Mobile number or email is required to send OTP.");
  }
};
