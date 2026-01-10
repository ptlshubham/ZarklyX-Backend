import { MetaSocialAccount } from "../meta-social-account.model";

function mapInstagramAccountsToDb(
    payload: any,
    companyId: string,
    clientId: number | null,   // ✅ allow null
    facebookUserId: string,
    userAccessTokenId: string
) {
    const records: any[] = [];

    // 1️⃣ Standalone accounts
    payload.accounts.forEach((acc: any) => {
        records.push({
            companyId,
            clientId: clientId ?? null,     // ✅ force null if undefined
            platform: "instagram",
            userAccessToken: userAccessTokenId,
            facebookUserId,
            facebookPageId: acc.id,
            instagramBusinessId: acc.instagram_business_account?.id || null,
            accountName: acc.instagram_business_account?.username || acc.name,
            pageAccessToken: null,
            isActive: false,
        });
    });

    // 2️⃣ Business accounts
    payload.businesses.forEach((business: any) => {
        business.igAccounts.forEach((ig: any) => {
            records.push({
                companyId,
                clientId: clientId ?? null,   // ✅ force null
                platform: "instagram",
                userAccessToken: userAccessTokenId,
                facebookUserId,
                facebookPageId: null,
                instagramBusinessId: ig.id,
                accountName: ig.username,
                pageAccessToken: null,
                isActive: false,
            });
        });
    });

    return records;
}

export async function saveInstagramAccountsToDb(
    payload: any,
    companyId: string,
    clientId: number | null = null,
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

    const result = await MetaSocialAccount.bulkCreate(records, {
        ignoreDuplicates: true,
    });

    console.log("added entry", result.length)

    return result;
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

  console.log("updated entries", updatedCount);

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
      "facebookPageId",
      "isAdded",
      "assignedClientId",
      "createdAt"
    ],
    order: [["createdAt", "DESC"]],
  });

  return accounts;
}
