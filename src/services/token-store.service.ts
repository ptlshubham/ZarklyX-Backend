
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { SocialToken, initSocialTokenModel } from "../routes/api-webapp/agency/social-Integration/social-token.model";
import { sequelize } from "../config/dbSQL";
export async function initTokenStore() {
  initSocialTokenModel(sequelize);
}

export async function saveOrUpdateToken(params: {
  accountEmail?: string | null;
  provider: string;
  scopes: string[];
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  tokenType?: string | null;
}) {
  const key = { accountEmail: params.accountEmail || null, provider: params.provider };
  const existing = await SocialToken.findOne({ where: key });
  const scopesStr = params.scopes.join(" ");
  if (existing) {
    existing.scopes = scopesStr;
    existing.accessToken = params.accessToken || null;
    existing.refreshToken = params.refreshToken || existing.refreshToken || null;
    existing.expiryDate = params.expiryDate || null;
    existing.tokenType = params.tokenType || null;
    await existing.save();
    return existing;
  }
  const created = await SocialToken.create({
    accountEmail: params.accountEmail || null,
    provider: params.provider,
    scopes: scopesStr,
    accessToken: params.accessToken || null,
    refreshToken: params.refreshToken || null,
    expiryDate: params.expiryDate || null,
    tokenType: params.tokenType || null,
  } as any);
  return created;
}

export async function getToken(provider: string, accountEmail?: string | null) {
  const token = await SocialToken.findOne({ where: { provider, accountEmail: accountEmail || null } });
  return token;
}

export async function updateAccessToken(provider: string, accountEmail: string | null, newAccessToken: string, expiryDate?: number | null, tokenType?: string | null) {
  const token = await SocialToken.findOne({ where: { provider, accountEmail } });
  if (!token) return null;
  token.accessToken = newAccessToken;
  token.expiryDate = expiryDate || null;
  token.tokenType = tokenType || token.tokenType || null;
  await token.save();
  return token;
}
