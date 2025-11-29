import express from "express";
import { Request, Response } from "express";
import { notFound } from "../../../../../services/response";
import dbInstance from "../../../../../db/core/control-db";
import {
    alreadyExist,
    serverError,
    unauthorized,
    sendEncryptedResponse,
    other,
} from "../../../../../utils/responseHandler";
import {
    generateOTP
} from "../../../../../services/password-service";
import { sendOTP } from "../../../../../services/otp-service";
import { generateToken, tokenMiddleWare } from "../../../../../services/jwtToken-service";
import { hashPassword, checkPassword, generateRandomPassword } from "../../../../../services/password-service";
import { sendEmail } from "../../../../../services/mailService";
import { Op } from "sequelize";
import ErrorLogger from "../../../../../db/core/logger/error-logger";
import { Otp } from "../../../../../routes/api-webapp/otp/otp-model";
import { Clients } from "../../../../../routes/api-webapp/superAdmin/agency/clients/clients-model";
import {
    addAgencyClient,
    getClientsByMbMo,
    getClientsByEmail,
} from "../../../../../routes/api-webapp/superAdmin/agency/clients/clients-handler";
import { User } from "../../../../../routes/api-webapp/authentication/user/user-model";
import { detectCountryCode,  } from "../../../../../services/phone-service";


const router = express.Router();
// signup for client (Agency)
router.post("/clientSignup/start",
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();

        try {
            const {
                businessName,
                ownerName,
                email,
                contact,
                countryCode,
                password,
                confirmPassword,
            } = req.body;

            // Validate required fields
            if (
                !businessName ||
                !ownerName ||
                !email ||
                !contact ||
                !password ||
                !confirmPassword
            ) {
                await t.rollback();
                res
                    .status(400)
                    .json({ success: false, message: "All fields required." });
                return;
            }

            if (password !== confirmPassword) {
                await t.rollback();
                res
                    .status(400)
                    .json({ success: false, message: "Passwords do not match." });
                return;
            }

            //  Auto-detect countryCode from contact
            const rawContact: string = String(contact).trim();
            const digitsOnly = rawContact.replace(/\D/g, "");

            // create detection string 
            let detectionNumber = rawContact;

            if (!rawContact.startsWith("+")) {
                // if only digits
                if (digitsOnly.length === 10) {
                    // India 10-digit number
                    detectionNumber = `+91${digitsOnly}`;
                } else {
                    // fallback: just add + and try
                    detectionNumber = `+${digitsOnly}`;
                }
            }

            const autoCountryCode = detectCountryCode(detectionNumber);
            const finalCountryCode = autoCountryCode || countryCode || null;

            if (!finalCountryCode) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "Invalid contact. Could not detect country code.",
                });
                return;
            }

            //  Check if client already exists
            const existsByEmail = await getClientsByEmail({ email });
            const existsByContact = await getClientsByMbMo({ contact });

            if (existsByEmail || existsByContact) {
                await t.rollback();
                res.status(409).json({
                    success: false,
                    message: "Email or Contact already registered.",
                });
                return;
            }

            //  Remove any previous OTP for this email (unique constraint)
            await Otp.destroy({ where: { email } });

            // 4. Generate OTP and create OTP record with temp data
            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            await Otp.create(
                {
                    userId: null,
                    //   clientId:null,
                    email,
                    contact,
                    otp,
                    otpVerify: false,
                    otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
                    tempUserData: {
                        businessName,
                        ownerName,
                        email,
                        contact,
                        countryCode: finalCountryCode,
                        password, // will be hashed by Clients model
                    },
                } as any,
                { transaction: t }
            );

            //  Send OTP email using your otp-service
            await sendOTP({ email, otp }, "register");

            await t.commit();
            res.status(200).json({
                success: true,
                message: "OTP sent to email. Please verify to complete signup.",
            });
        } catch (err) {
            await t.rollback();
            console.error("[clients/signup/start] ERROR:", err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

// signup for client - verify-otp
router.post(
    "/clientSignup/verify-otp",
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();

        try {
            const { email, otp } = req.body;

            if (!email || !otp) {
                await t.rollback();
                res
                    .status(400)
                    .json({ success: false, message: "Email & OTP required." });
                return;
            }

            // Find valid OTP record
            const otpRecord = await Otp.findOne({
                where: {
                    email,
                    otp,
                    otpVerify: false,
                    otpExpiresAt: { [Op.gt]: new Date() },
                },
                transaction: t,
            });

            if (!otpRecord) {
                await t.rollback();
                res
                    .status(400)
                    .json({ success: false, message: "Invalid / expired OTP." });
                return;
            }

            let temp: any = (otpRecord as any).tempUserData;

            // tempUserData stored as string JSON in DB → parse it
            if (typeof temp === "string") {
                try {
                    temp = JSON.parse(temp);
                } catch {
                    temp = null;
                }
            }

            // validate temp data
            if (
                !temp ||
                !temp.email ||
                !temp.contact ||
                !temp.businessName ||
                !temp.ownerName
            ) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "Signup data missing or invalid. Please restart signup.",
                });
                return;
            }

            //  Re-check if client already exists
            const existsByEmail = await getClientsByEmail({ email: temp.email });
            const existsByContact = await getClientsByMbMo({ contact: temp.contact });

            if (existsByEmail || existsByContact) {
                await t.rollback();
                res.status(409).json({
                    success: false,
                    message: "Email or Contact already registered.",
                });
                return;
            }

            //  Create client (after OTP success)
            const client: any = await Clients.create(
                {
                    businessName: temp.businessName,
                    ownerName: temp.ownerName,
                    email: temp.email,
                    contact: temp.contact,
                    countryCode: temp.countryCode,
                    password: temp.password, // hashed by Clients model 
                    isEmailVerified: true,
                    isMobileVerified: false,
                    isActive: true,
                    isDeleted: false,
                    businessBase: "",
                    country: "",
                    state: "",
                    city: "",
                    postcode: "",
                    address: "",
                    isVip: false,
                    isRegistering: false,
                    registrationStep: 0,
                },
                { transaction: t }
            );

            //Mark OTP as used & clear temp data
            otpRecord.set({
                otpVerify: true,
                isEmailVerified: true,
                isActive: false,
                otp: null,
                otpExpiresAt: null,
                tempUserData: null,
            });
            await otpRecord.save({ transaction: t });

            await t.commit();

            res.status(201).json({
                success: true,
                message: "Client signup successful!",
                data: {
                    id: client.id,
                    businessName: client.businessName,
                    ownerName: client.ownerName,
                    email: client.email,
                    contact: client.contact,
                },
            });
        } catch (err) {
            await t.rollback();
            console.error("[clients/signup/verify] ERROR:", err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);


export default router;