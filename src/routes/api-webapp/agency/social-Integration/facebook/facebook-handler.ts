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
            profilePhoto: acc.picture?.data?.url || acc.picture || null,
            pageAccessToken: acc.access_token || null,
            isAdded: false,
            isAssigned: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    });

    // 2️⃣ Business Manager accounts - handle both "pages" and "ownedPages" property names
    payload.businesses?.forEach((business: any) => {
        const businessPages = business.pages || business.ownedPages || [];
        console.log(`[FACEBOOK HANDLER] Processing business: ${business.id} ${business.name} with ${businessPages.length} pages`);
        
        businessPages.forEach((page: any) => {
            console.log(`[FACEBOOK HANDLER] Processing business page: ${page.id} ${page.name}`);
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
                profilePhoto: page.picture?.data?.url || page.picture || null,
                pageAccessToken: page.accessToken || page.access_token || null,  // Support both formats
                isAdded: false,
                isAssigned: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
    });

    console.log("[FACEBOOK HANDLER] Total records to insert:", records.length);
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

    console.log("[FACEBOOK HANDLER] Records to insert:", JSON.stringify(records, null, 2));

    if (!records.length) return [];

    // Insert one by one to handle duplicates properly
    const results = [];
    for (const record of records) {
        try {
            const [instance, created] = await MetaSocialAccount.findOrCreate({
                where: {
                    companyId: record.companyId,
                    platform: record.platform,
                    facebookPageId: record.facebookPageId,
                },
                defaults: record,
            });
            console.log(`[FACEBOOK HANDLER] ${created ? 'Created' : 'Already exists'}: ${record.accountName} (Page: ${record.facebookPageId})`);
            // If exists, update profilePhoto / accountName / pageAccessToken when available
            if (!created) {
                try {
                    const updates: any = {};
                    if (record.profilePhoto) updates.profilePhoto = record.profilePhoto;
                    if (record.accountName && record.accountName !== (instance as any).accountName) updates.accountName = record.accountName;
                    if (record.pageAccessToken) updates.pageAccessToken = record.pageAccessToken;
                    if (Object.keys(updates).length) {
                        await instance.update(updates);
                        console.log(`[FACEBOOK HANDLER] Updated existing record for Page: ${record.facebookPageId}`, updates);
                    }
                } catch (uerr: any) {
                    console.warn(`[FACEBOOK HANDLER] Failed to update existing record for Page: ${record.facebookPageId}`, uerr.message);
                }
            }
            results.push(instance);
        } catch (err: any) {
            console.error(`[FACEBOOK HANDLER] Error inserting ${record.accountName}:`, err.message);
        }
    }

    console.log("[FACEBOOK HANDLER] Total entries processed:", results.length);
    return results;
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
            "profilePhoto",
            "pageAccessToken",
            "isAdded",
            "isAssigned",
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
            // facebookBusinessId: { [require("sequelize").Op.not]: null }
        },
        attributes: [
            "id",
            "facebookPageId",
            "facebookBusinessId",
            "accountName",
            "profilePhoto",
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
