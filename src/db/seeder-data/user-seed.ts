// // import { Sequelize } from "sequelize/types";
// import  {  Sequelize} from "sequelize";

// const users = [
//   {
//     name:'Admin',
//     mobile_number:"9852565455",
//     email: "adminA@gmail.com",
//     // address: 'test',
//     // pincode:654565,
//     password: "$2a$10$PAPE5WbuLTxiuO6rDV6.8et1LAAki8IowrqsZ.7lpfnzAs.sVvp26",
//     // roleId: 1,
//     // isActive: 1,
//   },
// ];

// export const seedUser = async (sequelize: Sequelize) => {
//   return sequelize.getQueryInterface().bulkInsert("User", users);
// };


import { Sequelize } from "sequelize";

const users = [
  {
    name: 'Admin',
    mobile_number: "9852565455",
    email: "adminA@gmail.com",
    role: "driver", // or "passenger"
    loginType: "email",
    isEmailVerified: true,
    isMobileVerified: true,
    profile_completed: true,
    fcmToken: "dummy_fcm_token_here",
    otpVerify: true,
    deviceId: "device123",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export const seedUser = async (sequelize: Sequelize) => {
  return sequelize.getQueryInterface().bulkInsert("user", users);
};

