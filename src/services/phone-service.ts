import { parsePhoneNumberFromString,CountryCode } from "libphonenumber-js";

// export const detectCountryCode = (mobile: string, isoCountry: any): string | null => {
//   try {
//     const phone = parsePhoneNumberFromString(mobile);

//     if (!phone || !phone.isValid()) return null;

//     return `+${phone.countryCallingCode}`;
//   } catch {
//     return null;
//   }
// };

// contact + country-code 
export const detectCountryCode = (
  mobile: string,
  isoCountry?: string
): string | null => {
  try {
    const trimmed = String(mobile || "").trim();
    if (!trimmed) return null;

    // CountryCode type
    const country: CountryCode | undefined = isoCountry
      ? (isoCountry.toUpperCase() as CountryCode)
      : undefined;

    // local number ho + default country 
    const phone = parsePhoneNumberFromString(trimmed, country);

    if (!phone || !phone.isValid()) {
      return null;
    }

    return `+${phone.countryCallingCode}`;
  } catch (error) {
    return null;
  }
};


function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    return uuid;
}