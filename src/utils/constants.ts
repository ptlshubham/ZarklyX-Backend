export const GLOBAL_CONSTANTS = {
  token: "rideit_jwt_secret_2025",
  feesType: {
    rent: 100,
    spare: 50,
    battery: 200,
  },
  paymentStatus: {
    unPaid: 0,
    success: 1,
    pending: 2,
    fail: 3,
  },
  paymentType: {
    OFFLINE: "offline",
    ONLINE: "online",
  },
  email: {
    SENDER_EMAIL_HOST: "smtp.example.com",
    SENDER_EMAIL_PORT: 587,
    SENDER_EMAIL_ID: "example@example.com",
    SENDER_EMAIL_PASSWORD: "password123",
  },
  otpTemplateID: {
    register: '66b607add6fc057c8f61f502',
    changeMbNo: '66b607add6fc057c8f61f502',
    login: '67650614d6fc052df9378922',
    returnEV: '6765065dd6fc0508a04410b3',
    replaceEV: '676506b1d6fc057ec91206c2',
  },
  // other properties...
};



// export const GLOBAL_CONSTANTS = {
//     token: 'rgb*proses',
//     feesType: {
//       rent: 1,
//       spare: 2,
//       battery: 3,
//     },
//     paymentStatus: {
//       unPaid: 0,
//       success: 1,
//       pending: 2,
//       fail: 3,
//     },
//     paymentType: {
//       OFFLINE: "Offline",
//       ONLINE: "Online",
//     },
  
//     paymentStatusList: [
//       { value: 0, label: "UnPaid" },
//       { value: 1, label: "Success" },
//       { value: 2, label: "Pending" },
//       { value: 3, label: "Fail" },
//     ],
  
//     assignEvStatus :{
//       pending: 5,
//       approved: 6,
//       rejected: 11
//     },
  
//     STATE: {
//       Maharashtra: 4008,
//       Karnataka: 4026,
//     },
  
//     razorPay: {
//       key_id: "rzp_live_iCzvmZsOM42Bnw",
//       key_secret: "u1NVU4dIZr84cDLWSJuAVrvQ",
//     },
  
//     otpTemplateID: {
//       register: '66b607add6fc057c8f61f502',
//       changeMbNo: '66b607add6fc057c8f61f502',
//       login: '67650614d6fc052df9378922',
//       returnEV: '6765065dd6fc0508a04410b3',
//       replaceEV: '676506b1d6fc057ec91206c2',
//     },
  
//     // razorPayTesting: {
//     //   key_id: "rzp_test_vKQF35ZbRFMmOE",
//     //   key_secret: "OVP0Py8yYFdj5EQKtP6YLk6W",
//     // },
//     razorPayTesting: {
//       key_id: "rzp_test_aiTPJQrd8DpGEZ",
//       key_secret: "a5ZL8tOlQqXU8xx7tlayDmhs",
//     }
//   };
  
  
  export const status = {
    success: "Success"
  }
  
  
  
  
  // export const SLUG = {
  //   INWARD_EV: "EVGIN/",
  //   INWARD_SP: "SPGIN/",
  //   ASSIGN_EV: "EVISS/",
  //   RTNRPL_EV: "EVRTN/",
  // };
  
  // export const INWARD_EV_STATUS_ID = {
  //   pending: 1,
  //   approved: 2,
  // };
  
  // export const INWARD_SP_STATUS_ID = {
  //   pending: 3,
  //   approved: 4,
  // };
  
  // export const ASSIGN_EV_STATUS_ID = {
  //   pending: 5,
  //   approved: 6,
  //   rejected: 11
  // };
  
  // export const RETURN_EV_STATUS_ID = {
  //   pending: 7,
  //   approved: 8,
  // };
  
  // export const INWARD_EV_DETAIL_STATUS_ID = {
  //   idle: 12,
  //   maintenance: 13,
  //   discontinued: 14,
  //   assigned: 15,
  //   rejected: 16,
  // };
  
  
  export const getUniqCode = (oldCode: any) => {
    let e_code = oldCode.substring(0, oldCode.length - 4); //remove last 4 digit
    let lastCode = (parseInt(oldCode.slice(oldCode.length - 4)) + 1).toString(); //get last 4 digits
    if (lastCode.length == 1) {
      lastCode = `000${lastCode}`;
    } else if (lastCode.length == 2) {
      lastCode = `00${lastCode}`;
    } else if (lastCode.length == 3) {
      lastCode = `0${lastCode}`;
    }
    console.log(oldCode, "this is old sequence number");
    console.log(`${e_code}${lastCode}`, "this is new sequence number");
    let newCode = `${e_code}${lastCode}`;
    return newCode; //new sequence number
  };
  