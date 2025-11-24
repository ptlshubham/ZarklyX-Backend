import bcrypt from "bcryptjs";

//hash password
export const hashPassword = (value: string) => {
  let salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(value, salt);
};

//check password
export const checkPassword = (pass: string, hash: string) => {
  return bcrypt.compareSync(pass, hash);
};

//generate password
export const generateRandomPassword = (): string => {
  var length = 8,
    charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    retVal = "";
  for (var i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
};


//Generate OTP
export const generateOTP = () =>
  {
  
      const digits = '0123456789';
      const otpLength = 6;
      let otp = '';
      for(let i=1; i<=otpLength; i++) {
          var index = Math.floor(Math.random()*(digits.length));
          otp = otp + digits[index];
      }
      return otp;
  }
