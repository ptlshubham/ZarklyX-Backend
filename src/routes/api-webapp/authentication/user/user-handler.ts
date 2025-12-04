
import { User } from "../../../../routes/api-webapp/authentication/user/user-model"; // Ensure correct import
import { Op, Transaction } from "sequelize";
const { MakeQuery } = require("../../../../services/model-service");
// const { MakeQuery } = require("../../../services/model-service");
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import * as appleSigninAuth from "apple-signin-auth";
import jwt from "jsonwebtoken";

console.log(User);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
const JWT_SECRET = process.env.JWT_SECRET || "super-secret";

// user type
export enum userType {
  agency = "agency",
  FREELANCER = "freelancer",
}

// login type
export enum LoginType {
  EMAIL = "email",
  GOOGLE = "google",
  FACEBOOK = "facebook",
}

const LoginType_fields = [
  "id",
  "email"
];

// Function to generate a uniwue secret code
export async function generateUniqueSecretCode(): Promise<string> {
  while (true) {
    const digits = Math.floor(10 + Math.random() * 90);
    const upper = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const lower1 = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    const lower2 = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    const code = `${digits}${upper}${lower1}${lower2}`;

    const exists = await User.findOne({
      where: { secretCode: code },
      raw: true,
    });

    if (!exists) return code; // 100% Unique
  }
}

// Define the user payload interface
interface UserPayload {
  referId?: string | null;
  companyId?: number | null;        // Required for step 5
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  contact?: string;
  userType?: userType | "agency" | "freelancer";
  secretCode?: string;
  isThemeDark?: boolean;
  categories?: any[] | null;        // (JSON array of categories)
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  isRegistering?: boolean;
  registrationStep?: number;
  isActive?: boolean;
  [key: string]: any;

}

// Function to add user to DB
export const addUser = async (body: UserPayload, t: Transaction) => {
  return User.create(body as any, { transaction: t });
};

//for get user filter
export const getAllUser = (query: any) => {
  const {
    limit: rawLimit,
    offset: rawOffset,
    modelOption,
    orderBy,
    attributes,
    forExcel,
  } = MakeQuery({
    query,
    Model: User,
  });

  // Parse limit and offset with fallback values
  const limit = Number(rawLimit) || 10;
  const offset = Number(rawOffset) || 0;

  let modalParam: any = {
    where: modelOption,
    attributes,
    order: orderBy,
    raw: true,
    // include, // You can uncomment this if needed
  };

  // Add pagination only if not for Excel
  if (!forExcel) {
    modalParam.limit = limit;
    modalParam.offset = offset;
  }

  return User.findAndCountAll(modalParam);
};

// for get user by ID
export const getUserByid = async (id: string) => {
  return await User.findByPk(id); // returns null if not found
};

// Update employee details
export const updateUser = async (id: number, body: any, t: any) => {
  return await User.update(body, { where: { id }, transaction: t });
};

export const updateTheme = async (id: number, body: any, t: any) => {
  return await User.update(body, { where: { id }, transaction: t });
};

// Function to check if user already exists
export const checkUserData = async (body: any) => {
  const { email, contact, secretCode, id } = body;

  const orConditions: any[] = [];

  if (email) orConditions.push({ email });
  if (contact) orConditions.push({ contact });
  if (secretCode) orConditions.push({ secretCode });

  if (orConditions.length === 0) {
    return {
      emailExists: false,
      contactExists: false,
      secretCodeExists: false,
      user: null,
    };
  }

  const whereCondition: any = {
    [Op.or]: orConditions,
  };

  // Exclude current user during update
  if (id) {
    whereCondition.id = { [Op.ne]: id };
  }

  const user = await User.findOne({
    where: whereCondition,
    raw: true,
  });

  if (!user) {
    return {
      emailExists: false,
      contactExists: false,
      secretCodeExists: false,
      user: null,
    };
  }

  // Return detailed flags
  return {
    emailExists: email ? user.email === email : false,
    contactExists: contact ? user.contact === contact : false,
    secretCodeExists: secretCode ? user.secretCode === secretCode : false,
    user,
  };
};

// Function to get user by email
export const tenantUserByEmail$ = async (email: string) => {
  return await User.findOne({
    where: { email },
    attributes: ["email"],
  });
};

//for delete user
export const deleteUser = async (id: number, transaction: any) => {
  const user = await User.findOne({ where: { id }, transaction });

  if (!user) {
    console.log(`User with ID ${id} not found.`);
    return null;
  }

  // Perform soft delete
  const updatedUser = await user.update(
    {
      isDeleted: true,
      deletedAt: new Date(),
    },
    { transaction }
  );

  console.log(`User with ID ${id} marked as deleted.`);
  return updatedUser;
};


//for get all user for dropdown
export const UserData = (body: any) => {
  const { email, id } = body;
  return User.findOne({
    where: { email },
    attributes: ["email", "id"],
    raw: true,
  });
};

//to get User by email
export const getUserByEmail = (data: any) => {
  return User.findOne({
    where: {
      email: data.email,
    },
    raw: true,
  });
};

//to get User by mb no
export const getUserByMbMo = (data: any) => {
  return User.findOne({
    where: {
      contact: data.contact,
    },
    raw: true,
  });

};

// // Function to handle Google Sign-In
// export const handleGoogleSignIn = async (body: { idToken: string }, t: Transaction) => {
//   const { idToken } = body;
//   const client = new OAuth2Client(GOOGLE_CLIENT_ID);

//   const ticket = await client.verifyIdToken({
//     idToken,
//     audience: GOOGLE_CLIENT_ID,
//   });

//   const payload = ticket.getPayload();
//   if (!payload || !payload.email) {
//     throw new Error("Invalid Google token or email missing.");
//   }

//   let user = await getUserByEmail({ email: payload.email });

//   if (!user) {
//     // User doesn't exist, create a new one (sign-up)
//     const newUserPayload: UserPayload = {
//       email: payload.email,
//       firstName: payload.given_name,
//       lastName: payload.family_name,
//       isEmailVerified: payload.email_verified,
//       isRegistering: false, // Assuming direct login after social signup
//       isActive: true,
//     };
//     user = await addUser(newUserPayload, t);
//   }

//   // User exists or was just created, generate JWT (sign-in)
//   const jwtToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
//     expiresIn: "1d",
//   });

//   return { token: jwtToken, user };
// };

// // Function to handle Apple Sign-In
// export const handleAppleSignIn = async (body: { code: string; user?: { name?: { firstName?: string; lastName?: string }; email?: string } }, t: Transaction) => {
//   const { code, user: appleUser } = body;

//   const appleAuthOptions = {
//     client_id: APPLE_CLIENT_ID,
//     client_secret: () => { /* Implement logic to generate client secret */ return ""; },
//     redirect_uri: "" /* Add your redirect URI if you have one */
//   };

//   const tokenResponse = await appleSigninAuth.getAuthorizationToken(code, appleAuthOptions);
//   const idToken = jwt.decode(tokenResponse.id_token) as { email: string; [key: string]: any };

//   if (!idToken || !idToken.email) {
//     throw new Error("Invalid Apple token or email missing.");
//   }

//   let user = await getUserByEmail({ email: idToken.email });

//   if (!user) {
//     // User doesn't exist, create a new one (sign-up)
//     const newUserPayload: UserPayload = {
//       email: idToken.email,
//       firstName: appleUser?.name?.firstName,
//       lastName: appleUser?.name?.lastName,
//       isEmailVerified: true, // Email from Apple is considered verified
//       isRegistering: false,
//       isActive: true,
//     };
//     user = await addUser(newUserPayload, t);
//   }

//   // User exists or was just created, generate JWT (sign-in)
//   const jwtToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
//     expiresIn: "1d",
//   });

//   return { token: jwtToken, user };
// };


// 🔹 Social Login (Google + Apple) – DB + token logic only
export const socialLoginHandler = async (body: any) => {
  const { provider, idToken, firstName, lastName, email: fallbackEmail } = body;

  if (!provider || !idToken) {
    throw new Error("provider & idToken are required");
  }

  let socialId: string;
  let email: string | null = null;

  // ---------------- GOOGLE LOGIN ----------------
  if (provider === "google") {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw new Error("Invalid Google token");
    }

    socialId = payload.sub;
    email = payload.email || fallbackEmail || null;
  }

  // ---------------- APPLE LOGIN ----------------
  else if (provider === "apple") {
    const payload: any = await appleSigninAuth.verifyIdToken(idToken, {
      audience: APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });

    if (!payload || !payload.sub) {
      throw new Error("Invalid Apple token");
    }

    socialId = payload.sub;
    email = payload.email || fallbackEmail || null;
  }

  // ---------------- INVALID PROVIDER ----------------
  else {
    throw new Error("Invalid provider. Allowed: google, apple");
  }

  // ---------- FIND USER ----------
  let where: any = {};
  if (provider === "google") where.googleId = socialId;
  if (provider === "apple") where.appleId = socialId;

  let user = await User.findOne({ where });

  // If not found by socialId, try by email (link accounts)
  if (!user && email) {
    user = await User.findOne({ where: { email } });
  }

  let isNew = false;

  // ---------- SIGNUP (CREATE USER) ----------
  if (!user) {
    const newUser: any = {
      referId: null,
      companyId: null,
      firstName: firstName || null,
      lastName: lastName || null,
      email: email || null,
      contact: null,
      userType: null,
      secretCode: null,
      isThemeDark: false,
      password: null,
      countryCode: null,
      categories: null,
      isDeleted: false,
      deletedAt: null,
      isEmailVerified: true,   // ✅ social login → email considered verified
      isRegistering: true,     // ✅ FIXED: Mark as registering to complete profile
      registrationStep: 1,     // ✅ FIXED: Step 1 = Email verified, now need mobile/profile
      isMobileVerified: false,
      isActive: true,
      googleId: provider === "google" ? socialId : null,
      appleId: provider === "apple" ? socialId : null,
      authProvider: provider,
    };

    user = await User.create(newUser);
    isNew = true;
  }

  // ---------- SIGNIN (UPDATE USER IF NEEDED) ----------
  else {
    let updated = false;

    if (provider === "google" && !(user as any).googleId) {
      (user as any).googleId = socialId;
      updated = true;
    }

    if (provider === "apple" && !(user as any).appleId) {
      (user as any).appleId = socialId;
      updated = true;
    }

    if (!user.email && email) {
      user.email = email;
      updated = true;
    }

    if (!user.firstName && firstName) {
      user.firstName = firstName;
      updated = true;
    }

    if (!user.lastName && lastName) {
      user.lastName = lastName;
      updated = true;
    }

    if ((user as any).authProvider !== provider) {
      (user as any).authProvider = provider;
      updated = true;
    }

    if (updated) await user.save();
  }

  // ---------- GENERATE JWT ----------
  const token = jwt.sign(
    {
      userId: (user as any).id,
      provider,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    isNew,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      authProvider: (user as any).authProvider,
      isRegistering: user.isRegistering,  // ✅ Added: registration status
    },
    token,
  };
};
//check user is Active or not 
export const checkUserActive = async (email: string) => {
  const user = await User.findOne({
    where: {
      email,
      // isActive: true, // or whatever your column is
    },
  });
  return !!user;
};