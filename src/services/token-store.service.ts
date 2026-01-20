
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
  accountId?: string | null;
  companyId?: string | null;
  provider: string;
  scopes: string[];
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  tokenType?: string | null;
}) {
  const scopesStr = params.scopes.join(" ");

  // find only by provider
  const existing = await SocialToken.findOne({
    where: { provider: params.provider },
  });

  if (existing) {
    //  UPDATE (do NOT overwrite email with null)
    existing.scopes = scopesStr;
    existing.accessToken = params.accessToken ?? existing.accessToken;
    existing.refreshToken = params.refreshToken ?? existing.refreshToken;
    existing.expiryDate = params.expiryDate ?? existing.expiryDate;
    existing.tokenType = params.tokenType ?? existing.tokenType;

    // update email/id ONLY if present
    if (params.accountEmail) {
      existing.accountEmail = params.accountEmail;
    }
    if (params.accountId) {
      existing.accountId = params.accountId;
    }
    
    // Update companyId if provided
    if (params.companyId) {
      existing.companyId = params.companyId;
    }

    await existing.save();
    return existing;
  }

  //INSERT
  const created = await SocialToken.create({
    provider: params.provider,
    companyId: params.companyId || null,
    scopes: scopesStr,
    accessToken: params.accessToken || null,
    refreshToken: params.refreshToken || null,
    expiryDate: params.expiryDate || null,
    tokenType: params.tokenType || null,
    accountEmail: params.accountEmail || null,
    accountId: params.accountId || null,
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

export async function getConnectedDrivesByCompanyId(companyId: string) {
  const drives = await SocialToken.findAll({
    where: { companyId: companyId, provider: "google" }
  });
  return drives;
}

export async function deleteTokensByCompanyIdAndProvider(companyId: string, provider: string) {
  const deletedCount = await SocialToken.destroy({
    where: { companyId: companyId, provider: provider }
  });
  return deletedCount;
}
