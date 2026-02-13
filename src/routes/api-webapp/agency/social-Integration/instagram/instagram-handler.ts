import { Op } from "sequelize";
import { Clients } from "../../clients/clients-model";
import { MetaSocialAccount } from "../meta-social-account.model";
import { SocialToken } from "../social-token.model";
import { searchInstagramUserByUsername } from "../../../../../services/instagram-service";

function mapInstagramAccountsToDb(
  payload: any,
  companyId: string,
  clientId: string | null,
  facebookUserId: string,
  userAccessTokenId: string
) {
  const records: any[] = [];

  // 1️⃣ Standalone accounts
  payload.accounts?.forEach((acc: any) => {
    records.push({
      companyId,
      assignedClientId: clientId ?? null,
      platform: "instagram",
      userAccessTokenId: userAccessTokenId,
      facebookUserId,
      facebookPageId: acc.id,
      facebookBusinessId: null,
      instagramBusinessId: acc.instagram_business_account?.id || null,
        accountName: acc.instagram_business_account?.username || acc.name,
        profilePhoto:
          acc.instagram_business_account?.profile_picture_url ||
          acc.instagram_business_account?.profile_pic ||
          acc.profile_picture_url ||
          acc.profile_pic ||
          acc.picture?.data?.url ||
          null,
      pageAccessToken: null,
      isAdded: false,
    });
  });

  // 2️⃣ Business accounts
  payload.businesses?.forEach((business: any) => {
    business.igAccounts?.forEach((ig: any) => {
      records.push({
        companyId,
        assignedClientId: clientId ?? null,
        platform: "instagram",
        userAccessTokenId: userAccessTokenId,
        facebookUserId,
        facebookPageId: ig.facebookPageId || null,
        facebookBusinessId: business.id || null,
        instagramBusinessId: ig.id,
        accountName: ig.username,
        profilePhoto: ig.profile_picture_url || ig.profile_pic || ig.profile_picture || null,
        pageAccessToken: null,
        isAdded: false,
      });
    });
  });

  return records;
}

export async function saveInstagramAccountsToDb(
  payload: any,
  companyId: string,
  clientId: string | null = null,
  facebookUserId: string,
  userAccessTokenId: string
) {
  const records = mapInstagramAccountsToDb(
    payload,
    companyId,
    clientId,
    facebookUserId,
    userAccessTokenId
  );

  if (!records.length) return [];

  // Insert one by one to handle duplicates properly
  const results = [];
  for (const record of records) {
    try {
      const [instance, created] = await MetaSocialAccount.findOrCreate({
        where: {
          companyId: record.companyId,
          platform: record.platform,
          instagramBusinessId: record.instagramBusinessId,
        },
        defaults: record,
      });
      // If it already existed, update profilePhoto / accountName / pageAccessToken when available
      if (!created) {
        try {
          const updates: any = {};
          if (record.profilePhoto) updates.profilePhoto = record.profilePhoto;
          if (record.accountName && record.accountName !== (instance as any).accountName) updates.accountName = record.accountName;
          if (record.pageAccessToken) updates.pageAccessToken = record.pageAccessToken;
          if (Object.keys(updates).length) {
            await instance.update(updates);
          }
        } catch (uerr: any) {
        }
      }
      results.push(instance);
    } catch (err: any) {
    }
  }

  return results;
}

export async function markInstagramAccountsAsAddedInDb(
  companyId: string,
  instagramBusinessIds: string[]
) {
  if (!instagramBusinessIds || !instagramBusinessIds.length) return [];

  const [updatedCount] = await MetaSocialAccount.update(
    { isAdded: true },
    {
      where: {
        companyId,
        platform: "instagram",
        instagramBusinessId: instagramBusinessIds,
      },
    }
  );

  return updatedCount;
}

export async function getAddedInstagramAccountsFromDb(companyId: string) {
  if (!companyId) return [];

  const accounts = await MetaSocialAccount.findAll({
    where: {
      companyId,
      platform: "instagram",
      isAdded: true
    },
    attributes: [
      "id",
      "instagramBusinessId",
      "accountName",
      "profilePhoto",
      "facebookPageId",
      "isAdded",
      "assignedClientId",
      "createdAt"
    ],
    include: [
      {
        model: Clients,
        as: "client",
        attributes: [
          "id",
          "clientfirstName",
          "clientLastName",
          "logo"
        ],
      },
    ],

    order: [["createdAt", "DESC"]],
  });

  return accounts;
}


export async function assignClientToInstagramAccount(
  companyId: string,
  instagramBusinessId: string,
  assignedClientId: string | null,
  t?: any
) {
  // Resolve the target account by either primary key `id` OR `instagramBusinessId`.
  const targetAccount = await MetaSocialAccount.findOne({
    where: {
      companyId,
      platform: "instagram",
      [Op.or]: [
        { instagramBusinessId },
        { id: instagramBusinessId },
      ],
    },
    transaction: t,
  });

  if (!targetAccount) {
    throw new Error("Instagram account not found for given identifier");
  }

  // Prevent assigning the same client to another IG account
  if (assignedClientId) {
    const existingAssignment = await MetaSocialAccount.findOne({
      where: {
        companyId,
        platform: "instagram",
        assignedClientId,
        id: {
          [Op.ne]: targetAccount.id,
        },
      },
      transaction: t,
    });

    if (existingAssignment) {
      throw new Error("Client already assigned to another Instagram account");
    }
  }

  // Update by primary key to avoid ambiguity
  await MetaSocialAccount.update(
    { assignedClientId },
    {
      where: {
        id: targetAccount.id,
      },
      transaction: t,
    }
  );

  const updatedAccount = await MetaSocialAccount.findOne({
    where: {
      id: targetAccount.id,
    },
    attributes: [
      "id",
      "instagramBusinessId",
      "accountName",
      "profilePhoto",
      "facebookPageId",
      "isAdded",
      "assignedClientId",
      "createdAt",
    ],
    include: [
      {
        model: Clients,
        as: "client",
        attributes: [
          "id",
          "clientfirstName",
          "clientLastName",
          "logo",
        ],
      },
    ],
    transaction: t,
  });

  return updatedAccount;
}

export async function unassignClientFromInstagramAccount(
  companyId: string,
  instagramBusinessId: string
) {
  const [updatedCount] = await MetaSocialAccount.update(
    { assignedClientId: null },
    {
      where: {
        companyId,
        platform: "instagram",
        instagramBusinessId,
      },
    }
  );

  return updatedCount;
}

export async function unassignClientFromPlatformByClientId(
  companyId: string,
  clientId: string,
  platform: "instagram" | "facebook",
  t?: any
) {
  const [updatedCount] = await MetaSocialAccount.update(
    { assignedClientId: null },
    {
      where: {
        companyId,
        platform,
        assignedClientId: clientId,
      },
      transaction: t,
    }
  );

  return updatedCount;
}

export async function getInstagramAccountsByClient(
  companyId: string,
  assignedClientId: string
) {
  return await MetaSocialAccount.findAll({
    where: {
      companyId,
      platform: "instagram",
      assignedClientId,
      isAdded: true
    },
    include: [
      {
        model: SocialToken,
        as: "userAccessTokenData",
        attributes: ["id", "accessToken", "refreshToken", "expiryDate"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
}

export async function getAssignedInstagramAccountsByCompanyId(
  companyId: string
) {
  if (!companyId) return [];

  const accounts = await MetaSocialAccount.findAll({
    where: {
      companyId,
      platform: "instagram",
      assignedClientId: {
        [Op.not]: null,
      },
    },
    attributes: [
      "id",
      "instagramBusinessId",
      "accountName",
      "profilePhoto",
      "facebookPageId",
      "isAdded",
      "assignedClientId",
      "createdAt"
    ],
    include: [
      {
        model: Clients,
        as: "client",
        attributes: [
          "id",
          "clientfirstName",
          "clientLastName",
          "logo"
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return accounts;
}

export async function getUnassignedInstagramAccountsByCompanyId(
  companyId: string
) {
  if (!companyId) return [];

  const accounts = await MetaSocialAccount.findAll({
    where: {
      companyId,
      platform: "instagram",
      assignedClientId: null,
    },
    attributes: [
      "id",
      "instagramBusinessId",
      "accountName",
      "facebookPageId",
      "isAdded",
      "assignedClientId",
      "createdAt"
    ],
    order: [["createdAt", "DESC"]],
  });

  return accounts;
}

export async function searchInstagramUserHandler(
  metaSocialAccountId: string,
) {
  const metaSocialAccount = await MetaSocialAccount.findByPk(String(metaSocialAccountId), {
      include: [
        {
          model: SocialToken,
          as: "userAccessTokenData",
          attributes: ["id", "accessToken", "refreshToken", "expiryDate"]
        }
      ],
      attributes: [
        "id",
        "instagramBusinessId",
        "accountName",
        "platform",
        "companyId",
        "userAccessTokenId"
      ]
    });
    return metaSocialAccount;
}

/**
 * Get all Instagram accounts for a company with their `isAdded` status
 * Shows which accounts are already added and which are NOT yet
 */
export async function getAccountsWithAddedStatus(
  companyId: string,
  userAccessTokenId?: string
) {
  if (!companyId) return [];

  const whereClause: any = {
    companyId,
    platform: "instagram",
  };

  // If specific token provided, filter by that token ID too
  if (userAccessTokenId) {
    whereClause.userAccessTokenId = userAccessTokenId;
  }

  const accounts = await MetaSocialAccount.findAll({
    where: whereClause,
    attributes: [
      "id",
      "instagramBusinessId",
      "accountName",
      "profilePhoto",
      "facebookPageId",
      "isAdded",  // 👈 IMPORTANT: Include the isAdded status
      "assignedClientId",
      "userAccessTokenId",
      "createdAt",
      "updatedAt"
    ],
    include: [
      {
        model: Clients,
        as: "client",
        attributes: [
          "id",
          "clientfirstName",
          "clientLastName",
          "logo"
        ],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return accounts;
}

/**
 * Remove Instagram account by primary key ID
 * - Delete all records where isAdded is false (disabled)
 * - Set isAdded to false for records where isAdded is true (instead of deleting)
 */
export async function removeInstagramAccount(
  accountId: string
) {
  if (!accountId) {
    throw new Error("accountId is required");
  }

  // Find account by primary key
  const account = await MetaSocialAccount.findByPk(accountId, {
    attributes: ["id", "companyId", "instagramBusinessId", "isAdded"],
  });

  if (!account) {
    throw new Error(`Account not found with ID: ${accountId}`);
  }

  const { companyId, instagramBusinessId } = account;

  // Find all records with this Instagram account
  const accountRecords = await MetaSocialAccount.findAll({
    where: {
      companyId,
      platform: "instagram",
      instagramBusinessId,
    },
    attributes: ["id", "isAdded"],
  });

  // Delete records where isAdded is false
  const deletedCount = await MetaSocialAccount.destroy({
    where: {
      companyId,
      platform: "instagram",
      instagramBusinessId,
      isAdded: false,
    },
  });

  // Set isAdded to false for records where isAdded is true
  const [updatedCount] = await MetaSocialAccount.update(
    { isAdded: false },
    {
      where: {
        companyId,
        platform: "instagram",
        instagramBusinessId,
        isAdded: true,
      },
    }
  );

  return {
    accountId,
    instagramBusinessId,
    recordsDeleted: deletedCount,
    recordsUpdated: updatedCount,
    totalProcessed: deletedCount + updatedCount,
  };
}
