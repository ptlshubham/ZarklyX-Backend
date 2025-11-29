import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const verifyGoogleIdToken = async (idToken: string) => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) throw new Error("Invalid Google token");

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    firstName: payload.given_name,
    lastName: payload.family_name,
    picture: payload.picture,
  };
};
