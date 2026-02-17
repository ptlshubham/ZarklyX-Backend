import { MetaSocialAccount } from "../meta-social-account.model";

/**
 * Map Pinterest accounts and boards to database format
 * Flow: OAuth token → map accounts → save to meta_social_accounts with FK to social_tokens
 */
function mapPinterestAccountsToDb(
    payload: any,
    companyId: string,
    clientId: number | null,
    pinterestUserId: string,
    userAccessToken: string,
    accountName: string
) {
    const records: any[] = [];

    // Pinterest Primary Account
    records.push({
        companyId,
        assignedClientId: clientId ?? null,
        platform: "pinterest",
        userAccessToken,  // FK to social_tokens table
        pinterestUserId,
        pinterestAccountId: pinterestUserId,
        accountName: accountName || "Pinterest Account",
        pageAccessToken: payload.access_token || null,
        isAdded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // If boards are provided in payload, create records for each board
    payload.boards?.forEach((board: any) => {
        records.push({
            companyId,
            assignedClientId: clientId ?? null,
            platform: "pinterest",
            userAccessToken,  // FK to social_tokens table
            pinterestUserId,
            pinterestAccountId: pinterestUserId,
            pinterestBoardId: board.id,
            accountName: board.name || accountName || "Pinterest Board",
            pageAccessToken: payload.access_token || null,
            isAdded: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    });

    return records;
}

/**
 * Save Pinterest accounts to database during OAuth flow
 * Called after OAuth callback when user authorizes Pinterest connection
 */
export async function savePinterestAccountsToDb(
    payload: any,
    companyId: string,
    pinterestUserId: string,
    userAccessToken: string,
    accountName: string,
    clientId: number | null = null
) {
    const records = mapPinterestAccountsToDb(
        payload,
        companyId,
        clientId,
        pinterestUserId,
        userAccessToken,
        accountName
    );

    if (!records.length) return [];

    const result = await MetaSocialAccount.bulkCreate(records, {
        ignoreDuplicates: true,
    });

    console.log("[PINTEREST HANDLER] Added entries:", result.length);

    return result;
}

/**
 * Mark Pinterest accounts as added/selected by user
 * Called when user completes setup and activates Pinterest connection
 */
export async function markPinterestAccountsAsAddedInDb(
    companyId: string,
    pinterestAccountIds: string[]
) {
    if (!pinterestAccountIds || !pinterestAccountIds.length) return 0;

    const [updatedCount] = await MetaSocialAccount.update(
        { isAdded: true, updatedAt: new Date() },
        {
            where: {
                companyId,
                platform: "pinterest",
                pinterestAccountId: pinterestAccountIds,
            },
        }
    );

    console.log("[PINTEREST HANDLER] Marked as added:", updatedCount);

    return updatedCount;
}

/**
 * Get all added Pinterest accounts for a company
 * Used in account management and board display
 */
export async function getAddedPinterestAccountsFromDb(companyId: string) {
    if (!companyId) return [];

    const accounts = await MetaSocialAccount.findAll({
        where: {
            companyId,
            platform: "pinterest",
            isAdded: true
        },
        attributes: [
            "id",
            "pinterestAccountId",
            "pinterestBoardId",
            "accountName",
            "pageAccessToken",
            "isAdded",
            "assignedClientId",
            "userAccessToken",
            "createdAt"
        ],
        order: [["createdAt", "DESC"]],
    });

    return accounts;
}

/**
 * Get all unadded Pinterest accounts (not yet enabled)
 * Used in account selection UI
 */
export async function getUnaddedPinterestAccountsFromDb(companyId: string) {
    if (!companyId) return [];

    const accounts = await MetaSocialAccount.findAll({
        where: {
            companyId,
            platform: "pinterest",
            isAdded: false
        },
        attributes: [
            "id",
            "pinterestAccountId",
            "pinterestBoardId",
            "accountName",
            "pageAccessToken",
            "isAdded",
            "userAccessToken",
            "createdAt"
        ],
        order: [["createdAt", "DESC"]],
    });

    return accounts;
}

/**
 * Get Pinterest boards for a specific account
 * Used when displaying available boards for pin creation
 */
export async function getPinterestBoardsFromDb(
    companyId: string,
    pinterestAccountId: string
) {
    if (!companyId || !pinterestAccountId) return [];

    const boards = await MetaSocialAccount.findAll({
        where: {
            companyId,
            platform: "pinterest",
            pinterestAccountId,
            isAdded: true,
            pinterestBoardId: {
                [require("sequelize").Op.not]: null
            }
        },
        attributes: [
            "id",
            "pinterestBoardId",
            "accountName",
            "pageAccessToken",
            "createdAt"
        ],
        order: [["createdAt", "DESC"]],
    });

    return boards;
}

/**
 * Delete Pinterest accounts when user disconnects
 */
export async function deletePinterestAccountsFromDb(companyId: string) {
    if (!companyId) return 0;

    const deletedCount = await MetaSocialAccount.destroy({
        where: {
            companyId,
            platform: "pinterest"
        }
    });

    console.log("[PINTEREST HANDLER] Deleted accounts:", deletedCount);

    return deletedCount;
}

/**
 * Update Pinterest account access token
 * Called when token is refreshed
 */
export async function updatePinterestAccessTokenInDb(
    companyId: string,
    pinterestAccountId: string,
    newAccessToken: string
) {
    const [updatedCount] = await MetaSocialAccount.update(
        { pageAccessToken: newAccessToken, updatedAt: new Date() },
        {
            where: {
                companyId,
                platform: "pinterest",
                pinterestAccountId
            },
        }
    );

    console.log("[PINTEREST HANDLER] Updated access token:", updatedCount);

    return updatedCount;
}

/**
 * Get Pinterest account by ID
 * Used for detailed account information
 */
export async function getPinterestAccountByIdFromDb(
    companyId: string,
    accountId: string
) {
    if (!companyId || !accountId) return null;

    const account = await MetaSocialAccount.findOne({
        where: {
            id: accountId,
            companyId,
            platform: "pinterest"
        },
        attributes: [
            "id",
            "pinterestAccountId",
            "pinterestBoardId",
            "accountName",
            "pageAccessToken",
            "isAdded",
            "assignedClientId",
            "userAccessToken",
            "createdAt"
        ]
    });

    return account;
}

/**
 * Assign Pinterest account to specific client
 * Used in multi-client scenarios
 */
export async function assignPinterestAccountToClientInDb(
    companyId: string,
    pinterestAccountId: string,
    clientId: number
) {
    const [updatedCount] = await MetaSocialAccount.update(
        { assignedClientId: clientId || null, updatedAt: new Date() },
        {
            where: {
                companyId,
                platform: "pinterest",
                pinterestAccountId
            },
        }
    );

    console.log("[PINTEREST HANDLER] Assigned to client:", updatedCount);

    return updatedCount;
}

/**
 * Get Pinterest accounts assigned to specific client
 * Used in client-specific views
 */
export async function getPinterestAccountsByClientIdFromDb(
    companyId: string,
    clientId: number
) {
    if (!companyId || !clientId) return [];

    const accounts = await MetaSocialAccount.findAll({
        where: {
            companyId,
            platform: "pinterest",
            assignedClientId: clientId,
            isAdded: true
        },
        attributes: [
            "id",
            "pinterestAccountId",
            "pinterestBoardId",
            "accountName",
            "pageAccessToken",
            "isAdded",
            "userAccessToken",
            "createdAt"
        ],
        order: [["createdAt", "DESC"]],
    });

    return accounts;
}
