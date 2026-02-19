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

// Configure transporter. Use secure=false for port 587 (TLS/STARTTLS), use secure=true for port 465 (SMTPS)
const useSecure = Number(emailConfig.SENDER_EMAIL_PORT) === 465;
const nodemailerTransporter = nodemailer.createTransport({
  host: emailConfig.SENDER_EMAIL_HOST,
  port: emailConfig.SENDER_EMAIL_PORT,
  secure: useSecure,
  auth: {
    user: emailConfig.SENDER_EMAIL_ID,
    pass: emailConfig.SENDER_EMAIL_PASSWORD,
  },
  tls: {
    // allow self-signed certs in non-production envs if needed
    rejectUnauthorized: environment === "production",
  },
});

type emailargs = {
  from: String;
  to: String;
  subject: String;
  text: String;
  replacements: any;
  htmlFile: String;
  attachments: any ;
  html: any ;
  cc: any;
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
    // email with FILE/template
    if (mailData.htmlFile) {
      const filePath = `${config.templatePath}/${mailData.htmlFile}.html`;
      try {
        const hbHtml = await fs.promises.readFile(filePath, { encoding: "utf8" });
        mailOptions.html = handleBars.compile(hbHtml)(mailData.replacements || {});
        if (mailData?.cc) {
          mailOptions.cc = mailData.cc;
        }
        if (mailData?.replyTo) {
          mailOptions.replyTo = mailData.replyTo;
        }
        res = await nodemailerTransporter.sendMail(mailOptions);
        let { htmlFile, attachments, html, replacements, ...rest } = mailData;
        logSmsEmail(JSON.stringify({ ...rest, res }), "success");
        return res;
      } catch (err: any) {
        console.error(`[sendEmail] template read/send error for ${filePath}:`, err);
        logSmsEmail({ err: (err as any)?.message || err, filePath }, "err");
        throw err;
      }
    } else {
      // email without FILE
      mailOptions.text = mailData.text ? mailData.text : "No Text";
      if (mailData?.html) {
        mailOptions.html = mailData.html;
      }
      if (mailData?.cc) {
        mailOptions.cc = mailData.cc;
      }
      if (mailData?.replyTo) {
        mailOptions.replyTo = mailData.replyTo;
      }
      res = await nodemailerTransporter.sendMail(mailOptions);
      let { htmlFile, html, attachments, replacements, ...rest } = mailData;
      logSmsEmail(JSON.stringify({ ...rest, res }), "success");
      return res;
    }
  } catch (error) {
    console.error("[sendEmail] error:", error);
    logSmsEmail({ err: (error as any)?.message || error }, "err");
    // rethrow so callers can react if needed
    throw error;
  }
};
