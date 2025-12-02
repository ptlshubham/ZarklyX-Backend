import nodemailer from "nodemailer";

import fs from "fs";
import handleBars from "handlebars";
import environment from "../../environment";
// import { makePromise } from "../utils/helpers";
import { errorLog, infoLog, logSmsEmail } from "./logging-service";
import { GLOBAL_CONSTANTS } from "../utils/constants";
const config = require("../config/config")[environment];
// const emailConfig = config.email; // mail configuration in config file
const emailConfig = GLOBAL_CONSTANTS.email;
// const emailConfig = config.email;

// mail setup //
// const nodemailerTransporter = nodemailer.createTransport({
//   //service: "gmail",
//   host: emailConfig.SENDER_EMAIL_HOST,
//   port: emailConfig.SENDER_EMAIL_PORT,
//   auth: {
//     user: emailConfig.SENDER_EMAIL_ID,
//     pass: emailConfig.SENDER_EMAIL_PASSWORD,
//   },
// });

//for Mobile App checkMail for OTP 
const nodemailerTransporter = nodemailer.createTransport({
  // service: "gmail",
  host: emailConfig.SENDER_EMAIL_HOST,
  port: emailConfig.SENDER_EMAIL_PORT,
  secure: true,
  auth: {
    user: emailConfig.SENDER_EMAIL_ID,
    pass: emailConfig.SENDER_EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

type emailargs = {
  from: String;
  to: String;
  subject: String;
  text: String;
  replacements: any;
  htmlFile: String;
  attachments: any;
  html: any;
  cc:any;
  replyTo: any;
};

//send mail using nodemailer for both simple text or html file
export const sendEmail = async (mailData: emailargs) => {
  try {
    let res;
    if (!mailData) {
      console.log("NO MAIL DATA FOUND");
      return false;
    }

    let mailOptions: any = {
      from: mailData.from || emailConfig.SENDER_EMAIL_ID,
      to: mailData.to || emailConfig.SENDER_EMAIL_ID,
      subject: mailData.subject || "ZarklyX  Email",
      attachments: mailData.attachments ? mailData.attachments : null,
    };

    if(mailData.replyTo) {
      mailOptions = { ...mailOptions, replyTo: mailData.replyTo };
    }

    // email with FILE
    if (mailData.htmlFile) {
      await fs.readFile(
        `${config.templatePath}/${mailData.htmlFile}.html`,
        { encoding: "utf8" },
        async function (err: any, hbHtml: any) {
          if (err) {
            console.log(err);
            throw err;
          } else {
            mailOptions.html = await handleBars.compile(hbHtml)(
              mailData.replacements
            );
            res = await nodemailerTransporter.sendMail(mailOptions);

            let { htmlFile, attachments, html, replacements, ...rest } =
              mailData;
            logSmsEmail(JSON.stringify({ ...rest, res }), "success");
            return res;
          }
        }
      );
    } else {
      // email without FILE
      mailOptions.text = mailData.text ? mailData.text : "No Text";
      if (mailData?.html) {
        mailOptions.html = mailData.html;
      }
      if(environment === 'production'){
        if(mailData?.cc) {
          mailOptions.cc = mailData.cc
        }
      }
      res = await nodemailerTransporter.sendMail(mailOptions);
      let { htmlFile, html, attachments, replacements, ...rest } = mailData;
      logSmsEmail(JSON.stringify({ ...rest, res }), "success");
      return res;
    }
  } catch (error) {
    console.log(error,"MMMMMMMMM");
    
    logSmsEmail(error, "err");
  }
};
