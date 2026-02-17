import { MetaSocialAccount } from "../meta-social-account.model";

/**
 * Map Facebook accounts and business pages to database format
 * Flow: OAuth token → map accounts → save to meta_social_accounts with FK to social_tokens
 */
function mapFacebookAccountsToDb(
    payload: any,
    companyId: string,
    clientId: number | null,
    facebookUserId: string,
    userAccessTokenId: string
) {
    const records: any[] = [];

    // 1️⃣ Standalone Page Admin accounts
    payload.accounts?.forEach((acc: any) => {
        records.push({
            companyId,
            assignedClientId: clientId ?? null,
            platform: "facebook",
            userAccessTokenId,  // FK to social_tokens table
            facebookUserId,
            facebookPageId: acc.id,
            facebookBusinessId: null,
            instagramBusinessId: null,
            accountName: acc.name || acc.username,
            pageAccessToken: acc.access_token || null,
            isAdded: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    });

    // 2️⃣ Business Manager accounts
    payload.businesses?.forEach((business: any) => {
        business.ownedPages?.forEach((page: any) => {
            records.push({
                companyId,
                assignedClientId: clientId ?? null,
                platform: "facebook",
                userAccessTokenId,  // FK to social_tokens table
                facebookUserId,
                facebookPageId: page.id,
                facebookBusinessId: business.id,
                instagramBusinessId: null,
                accountName: page.name || page.username,
                pageAccessToken: page.access_token || null,
                isAdded: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
    });

    return records;
}

/**
 * Save Facebook accounts to database during OAuth flow
 * Called after OAuth callback when user selects businesses and pages
 */
export async function saveFacebookAccountsToDb(
    payload: any,
    companyId: string,
    facebookUserId: string,
    userAccessTokenId: string,
    clientId: number | null = null
) {
    const records = mapFacebookAccountsToDb(
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

    console.log("[FACEBOOK HANDLER] Added entries:", result.length);

    return result;
}

/**
 * Mark Facebook accounts as added/selected by user in stepper
 * Called when user completes "DONE" step in the stepper
 */
export async function markFacebookAccountsAsAddedInDb(
    companyId: string,
    facebookPageIds: string[]
) {
    if (!facebookPageIds || !facebookPageIds.length) return 0;

    const [updatedCount] = await MetaSocialAccount.update(
        { isAdded: true, updatedAt: new Date() },
        {
            where: {
                companyId,
                platform: "facebook",
                facebookPageId: facebookPageIds,
            },
        }
    );

    console.log("[FACEBOOK HANDLER] Marked as added:", updatedCount);

    return updatedCount;
}

/**
 * Get all added Facebook pages for a company
 * Used in stepper and page configuration display
 */
export async function getAddedFacebookAccountsFromDb(companyId: string) {
    if (!companyId) return [];

    const accounts = await MetaSocialAccount.findAll({
        where: {
            companyId,
            platform: "facebook",
            isAdded: true
        },
        attributes: [
            "id",
            "facebookPageId",
            "facebookBusinessId",
            "accountName",
            "pageAccessToken",
            "isAdded",
            "assignedClientId",
            "userAccessTokenId",
            "createdAt"
        ],
        order: [["createdAt", "DESC"]],
    });

    return accounts;
}

/**
 * Get all business manager Facebook pages (not yet added)
 * Used in stepper business manager tab
 */
export async function getUnaddedBusinessManagerPagesFromDb(companyId: string) {
    if (!companyId) return [];

    const accounts = await MetaSocialAccount.findAll({
        where: {
            companyId,
            platform: "facebook",
            isAdded: false,
            facebookBusinessId: { [require("sequelize").Op.not]: null }
        },
        attributes: [
            "id",
            "facebookPageId",
            "facebookBusinessId",
            "accountName",
            "pageAccessToken",
            "isAdded",
            "userAccessTokenId",
            "createdAt"
        ],
        order: [["createdAt", "DESC"]],
    });

    return accounts;
}

/**
 * Delete Facebook accounts when user disconnects
 */
export async function deleteFacebookAccountsFromDb(companyId: string) {
    if (!companyId) return 0;

    const deletedCount = await MetaSocialAccount.destroy({
        where: {
            companyId,
            platform: "facebook"
        }
    });

    console.log("[FACEBOOK HANDLER] Deleted accounts:", deletedCount);

    return deletedCount;
}
