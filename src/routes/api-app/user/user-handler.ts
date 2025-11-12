import bcrypt from "bcryptjs";
import { User } from "../../../routes/api-app/user/user-model"; // Ensure correct import
import { Op ,Transaction} from "sequelize";
const { MakeQuery } = require("../../../services/model-service");
import axios from "axios";


console.log(User);

//function a get user by id
// export const getUserByid = (id: string) => {
//   return User.findOne({
//     where: { id },
//     raw: true,
//   });
// }; 

// export enum RoleType {
//   DRIVER = "driver",
//   PASSENGER = "passenger",
// }

export enum LoginType {
  EMAIL = "email",
  GOOGLE = "google",
  FACEBOOK = "facebook",
}

const USER_LOGIN_FIELDS = [
  "id",
  "name",
  "email",
  "mobile_number",
  "fcmToken",
  "otpVerify",
  "loginOTP",
  "deviceId",
  "password",
];
// interface UserPayload {
//   name?: string;
//   email?: string;
//   mobile_number?: string;
//   password?: string;
//   loginType?: "email" | "google" | "facebook";
//   role?: "driver" | "passenger";
//   otpVerify?: boolean;
//   profile_completed?: boolean;
//   isEmailVerified?: boolean;
//   isMobileVerified?: boolean;
//   fcmToken?: string;
//   [key: string]: any;
// }
interface UserPayload {
  name?: string;
  email?: string;
  mobile_number?: string;
  password?: string;
  countryCode?: string;
  loginType?: LoginType;
  // role?: RoleType;
  otpVerify?: boolean;
  profile_completed?: boolean;
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  fcmToken?: string;
  [key: string]: any;
}

export const buildTokenPayload = (user: any) => {
  return {
    id: user.id,
    // role: user.role,
    email: user.email,
    mobile_number: user.mobile_number,
    fcmToken: user.fcmToken || null,
    deviceId: user.deviceId || null,
  };
};

//for get all Active user
export const getAllActiveCustomerAtPayment = () => {
  return User.findAll({
    where: { otpVerify: 1, profile_completed: 1 },
    order: [["id", "DESC"]]
  });
};

// for get user by ID
export const getUserByid = async (id: string) => {
  return await User.findByPk(id); // returns null if not found
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

// Function to get user by email
export const tenantUserByEmail$ = async (email: string) => {
  return await User.findOne({
    where: { email },
    attributes: ["email"],
  });
};

// Function to check password in DB
export const checkPassword = async (pass: string, hash: string) => {
  return await bcrypt.compare(pass, hash);
};

// Function to add user to DB
export const addUser = async (body: UserPayload, t: Transaction) => {
  return  User.create(body as any, { transaction: t });
};

// Create Customer - bulkcreate
export const addUserBulk = async (body: any, t: Transaction) => {
  return User.bulkCreate(body, { transaction: t });
};

// Function to check if user already exists
export const checkUserData = async (body: any) => {
  const { email, mobile_number, id } = body;

  const orConditions: any[] = [];

  if (email) orConditions.push({ email });
  if (mobile_number) orConditions.push({ mobile_number });

  if (orConditions.length === 0) return null;

  const whereCondition: any = {
    [Op.or]: orConditions,
  };

  if (id) {
    // Exclude current user by ID
    whereCondition.id = { [Op.ne]: id };
  }

  return await User.findOne({
    where: whereCondition,
    raw: true,
  });
};


//for update user ??
export const updateUser = (body: any, id: number, t: Transaction) => {
  return User.update(body, {
    where: { id },
    transaction: t,
  });
};


// function to delete user from the db
// export const deleteUser = (params: any,t:any) => {
//   return User.destroy({
//     where: {
//       id: params.id,
//     },
//     transaction : t
//   });
// };

// Delete User by ID
// export const deleteUser = async (id: string, t: any) => {
//   const user = await User.findByPk(id);
//   if (!user) return null;

//   await user.destroy({ transaction: t });
//   return user; // returning deleted user info
// };

//latest code - 14april
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

// for OTP login - check mobile number
export const tenantUserByMobile$ = async (mobile_number: string) => {
  return await User.findOne({
    where: { mobile_number },
    attributes: ["mobile_number"],
  });
};

//to get user by email for login
export const getUserByEmailForLogin = (data: any) => {
  return User.findOne({
    where: {
      email: data.email,
    },
    // attributes: USER_LOGIN_FIELDS,
    attributes: [
      "id",
      "name",
      "email",
      "mobile_number",
      "fcmToken",
      "otpVerify",
      "loginOTP",
      "deviceId",
      "password",
    ],
    //never remove or make raw false as it is mandatory in login api
    raw: true,
  });
};

//to get user by mobile no for login
export const getUserByMobileForLogin = (data: any) => {
  return User.findOne({
    where: {
      mobile_number: data.mobile_number,
    },
    // attributes: USER_LOGIN_FIELDS,
    attributes: [
      "id",
      "name",
      "email",
      "mobile_number",
      "fcmToken",
      "otpVerify",
      "loginOTP",
      "deviceId",
      "password",
    ],
    //never remove or make raw false as it is mandatory in login api
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
      mobile_number: data.mobile_number,
    },
    raw: true,
  });
  
};


//for update User
export const updateUserFromApp = (body: any, params: any, t: any) => {
  return User.update(body, {
    where: { id: params.id },
    transaction: t,
  });
};

//for update user by email
export const updateUserByEmail = (body: any, emailData: any, t: any) => {
  return User.update(body, {
    where: { email: emailData },
    transaction: t,
  });
};
//Update FcmToken And DeviceId
export const updateFcmTokenAndDeviceId = (body: any, params: any, t: any) => {
  return User.update(body, { where: { email: params.email }, transaction: t });
};


// export const checkOtpVerificationStatus = async (identifier: string) => {
//   const otpEntry = await db.otp_verification.findOne({
//     where: {
//       identifier, // either mobile number or email
//       is_verified: true,
//     },
//   });

//   return !!otpEntry;
// };


// Signup with Google
// export const signupWithGoogle = async (accessToken: string) => {
//   try {
//     // Fetch user profile from Google
//     const googleResponse = await axios.get(
//       `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${accessToken}`
//     );
//     const userProfile = googleResponse.data;

//     // Check if user already exists
//     let user = await User.findOne({ where: { email: userProfile.email } });

//     if (!user) {
//       // If user doesn't exist, create a new user
//       // user = await User.create({
//       //   name: userProfile.name,
//       //   email: userProfile.email,
//       //   role: "passenger",
//       //   loginType: "google",
//       //   isEmailVerified: true,
//       // });

//       user = await User.create({
//         name: userProfile.name,
//         email: userProfile.email,
//         role: "passenger",
//         loginType: "google",
//         isEmailVerified: true,
//         mobile_number: "",
//         fcmToken: "",
//         isMobileVerified: false,
//         profile_completed: false,
//         otpVerify: true,           
//         deviceId: "",              
//         password: "",             
//         isActive: true,
//         isDeleted: true,       
//       });
//     }

//     return user;
//   } catch (error) {
//     console.error("Google Signup Error:", error);
//     throw new Error("Something went wrong during Google signup.");
//   }
// };

//latest -signup with google -14april
export const signupWithGoogle = async (
  accessToken: string,
  fcmToken = "",
  deviceId = ""
) => {
  try {
    // Get user data from Google
    const googleResponse = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${accessToken}`
    );
    const userProfile = googleResponse.data;

    let user = await User.findOne({ where: { email: userProfile.email } });

    if (!user) {
      user = await User.create({
        name: userProfile.name,
        email: userProfile.email,
        // role: "passenger",
        countryCode: userProfile.countryCode,
        loginType: "google",
        isEmailVerified: true,
        googleId: userProfile.sub, // optional, if you're storing Google ID
        mobile_number: "",
        fcmToken,
        deviceId,
        isMobileVerified: false,
        profile_completed: false,
        otpVerify: true,
        password: "",
        isActive: true,
        isDeleted: false,
      });
    } else {
      // Update FCM/deviceId if user already exists
      await user.update({ fcmToken, deviceId });
    }

    return user;
  } catch (error) {
    console.error("Google Signup Error:", error);
    throw new Error("Something went wrong during Google signup.");
  }
};


// Signup with Facebook
// export const signupWithFacebook = async (accessToken: string) => {
//   try {
//     // Fetch user profile from Facebook
//     const facebookResponse = await axios.get(
//       `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`
//     );
//     const userProfile = facebookResponse.data;

//     // Check if user already exists
//     let user = await User.findOne({ where: { email: userProfile.email } });

//     if (!user) {
//       // If user doesn't exist, create a new user
//       // user = await User.create({
//       //   name: userProfile.name,
//       //   email: userProfile.email,
//       //   role: "passenger",
//       //   loginType: "facebook",
//       //   isEmailVerified: true,
//       // });

//       user = await User.create({
//         name: userProfile.name,
//         email: userProfile.email,
//         role: "passenger",
//         loginType: "facebook",
//         isEmailVerified: true,
//         mobile_number: "",
//         fcmToken: "",
//         isMobileVerified: false,
//         profile_completed: false,
//         otpVerify: true,           
//         deviceId: "",             
//         password: "",            
//         isActive: true,
//         isDeleted: true,              
//       });
//     }

//     return user;
//   } catch (error) {
//     console.error("Facebook Signup Error:", error);
//     throw new Error("Something went wrong during Facebook signup.");
//   }
// };

// Signup with Facebook - 14april
export const signupWithFacebook = async (
  accessToken: string,
  fcmToken = "",
  deviceId = ""
) => {
  try {
    const facebookResponse = await axios.get(
      `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`
    );
    const userProfile = facebookResponse.data;

    let user = await User.findOne({ where: { email: userProfile.email } });

    if (!user) {
      user = await User.create({
        name: userProfile.name,
        email: userProfile.email,
        // role: "passenger",
        countryCode: userProfile.countryCode,
        loginType: "facebook",
        isEmailVerified: true,
        facebookId: userProfile.id,
        mobile_number: "",
        fcmToken,
        deviceId,
        isMobileVerified: false,
        profile_completed: false,
        otpVerify: true,
        password: "",
        isActive: true,
        isDeleted: false,
      });
    } else {
      // Update FCM/deviceId if user already exists
      await user.update({ fcmToken, deviceId });
    }

    return user;
  } catch (error) {
    console.error("Facebook Signup Error:", error);
    throw new Error("Something went wrong during Facebook signup.");
  }
};



// Login with Facebook
export const loginWithFacebook = async (accessToken: string) => {
  try {
    // Fetch user profile from Facebook
    const facebookResponse = await axios.get(
      `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`
    );
    const userProfile = facebookResponse.data;

    // Check if user exists
    const user = await User.findOne({ where: { email: userProfile.email } });
    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  } catch (error) {
    console.error("Facebook Login Error:", error);
    throw new Error("Something went wrong during Facebook login.");
  }
};


// Login with Google
export const loginWithGoogle = async (accessToken: string) => {
  try {
    // Fetch user profile from Google
    const googleResponse = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${accessToken}`
    );
    const userProfile = googleResponse.data;

    // Check if user exists
    const user = await User.findOne({ where: { email: userProfile.email } });
    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  } catch (error) {
    console.error("Google Login Error:", error);
    throw new Error("Something went wrong during Google login.");
  }
};