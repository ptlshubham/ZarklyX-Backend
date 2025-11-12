import configs from "../config/config";
import environment from "../../environment";
const config = (configs as { [key: string]: any })[environment];

// const crypto = require("crypto-js");
import crypto from "crypto-js";


export const encryptData = (data: any) => {
    let codedData = JSON.stringify(data);
    var ciphertext = crypto.AES.encrypt(codedData, config.cryptoKey).toString();
    return ciphertext;
  };
  
export const decryptData = (data: any) => {
    var bytes = crypto.AES.decrypt(data, config.cryptoKey);
    var decryptedData = bytes.toString(crypto.enc.Utf8);
    return decryptedData;
  };