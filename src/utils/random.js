var crypto = require("crypto");

function rn(max) {
  var rnBytes = crypto.randomBytes(2);
  var randomNum = rnBytes.readUInt8(0) * 256 + rnBytes.readUInt8(1);
  return randomNum % max;
}

const random = (len, chars) => {
  len = len || 16;
  chars =
    chars ||
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@$";
  var key = "";
  var charsLen = chars.length;
  for (var i = 0; i < len; i++) {
    key += chars[rn(charsLen)];
  }
  return key;
};

module.exports = random;
