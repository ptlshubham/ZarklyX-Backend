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
