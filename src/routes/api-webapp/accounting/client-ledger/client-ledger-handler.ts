import { Request, Response } from "express";
import { Transaction, Sequelize } from "sequelize";
import { ClientLedger, ReferenceType } from "./client-ledger-model";
import { Clients } from "../../agency/clients/clients-model";
import { successResponse } from "../../../../services/response";

// ============================================================================
// LEDGER UTILITY FUNCTIONS
// ============================================================================

/**
 * Add a ledger entry for opening balance when a client is created
 */
export async function addOpeningBalanceLedger(
    clientId: string,
    companyId: string,
    openingBalance: number,
    transaction?: Transaction
): Promise<ClientLedger | null> {
    if (openingBalance === 0) {
        return null;
    }

    const debit = openingBalance > 0 ? openingBalance : 0;
    const credit = openingBalance < 0 ? Math.abs(openingBalance) : 0;

    return await ClientLedger.create(
        {
            clientId,
            companyId,
            referenceType: "opening_balance",
            referenceId: null,
            documentNumber: null,
            transactionDate: new Date(),
            description: "Opening Balance",
            debit,
            credit,
        },
        { transaction }
    );
}

/**
 * Add a ledger entry for an invoice
 */
export async function addInvoiceLedger(
    clientId: string,
    companyId: string,
    invoiceId: string,
    invoiceNumber: string,
    invoiceDate: Date,
    invoiceTotal: number,
    transaction?: Transaction
): Promise<ClientLedger> {
    return await ClientLedger.create(
        {
            clientId,
            companyId,
            referenceType: "invoice",
            referenceId: invoiceId,
            documentNumber: invoiceNumber,
            transactionDate: invoiceDate,
            description: `Invoice ${invoiceNumber}`,
            debit: invoiceTotal,
            credit: 0,
        },
        { transaction }
    );
}

/**
 * Add a ledger entry for payment received
 */
export async function addPaymentLedger(
    clientId: string,
    companyId: string,
    paymentId: string,
    paymentDate: Date,
    paymentAmount: number,
    transaction?: Transaction
): Promise<ClientLedger> {
    return await ClientLedger.create(
        {
            clientId,
            companyId,
            referenceType: "payment",
            referenceId: paymentId,
            documentNumber: null,
            transactionDate: paymentDate,
            description: "Payment Received",
            debit: 0,
            credit: paymentAmount,
        },
        { transaction }
    );
}

/**
 * Add a ledger entry for credit note
 */
export async function addCreditNoteLedger(
    clientId: string,
    companyId: string,
    creditNoteId: string,
    creditNoteNumber: string,
    creditNoteDate: Date,
    creditNoteTotal: number,
    transaction?: Transaction
): Promise<ClientLedger> {
    return await ClientLedger.create(
        {
            clientId,
            companyId,
            referenceType: "credit_note",
            referenceId: creditNoteId,
            documentNumber: creditNoteNumber,
            transactionDate: creditNoteDate,
            description: `Credit Note ${creditNoteNumber}`,
            debit: 0,
            credit: creditNoteTotal,
        },
        { transaction }
    );
}

/**
 * Add a ledger entry for debit note
 */
export async function addDebitNoteLedger(
    clientId: string,
    companyId: string,
    debitNoteId: string,
    debitNoteNumber: string,
    debitNoteDate: Date,
    debitNoteTotal: number,
    transaction?: Transaction
): Promise<ClientLedger> {
    return await ClientLedger.create(
        {
            clientId,
            companyId,
            referenceType: "debit_note",
            referenceId: debitNoteId,
            documentNumber: debitNoteNumber,
            transactionDate: debitNoteDate,
            description: `Debit Note ${debitNoteNumber}`,
            debit: debitNoteTotal,
            credit: 0,
        },
        { transaction }
    );
}

/**
 * Delete ledger entries by reference
 */
export async function deleteLedgerByReference(
    referenceType: ReferenceType,
    referenceId: string,
    transaction?: Transaction
): Promise<number> {
    return await ClientLedger.destroy({
        where: {
            referenceType,
            referenceId,
        },
        transaction,
    });
}

/**
 * Get client ledger with running balance
 */
async function getClientLedger(
    clientId: string,
    companyId: string,
    fromDate?: Date,
    toDate?: Date,
    limit?: number,
    offset?: number
): Promise<any[]> {
    const sequelize = ClientLedger.sequelize as Sequelize;

    let whereConditions = `cl.client_id = :clientId AND cl.company_id = :companyId`;
    const replacements: any = { clientId, companyId };

    if (fromDate) {
        whereConditions += ` AND cl.transaction_date >= :fromDate`;
        replacements.fromDate = fromDate;
    }

    if (toDate) {
        whereConditions += ` AND cl.transaction_date <= :toDate`;
        replacements.toDate = toDate;
    }

    let limitOffset = "";
    if (limit) {
        limitOffset += ` LIMIT :limit`;
        replacements.limit = limit;
    }
    if (offset) {
        limitOffset += ` OFFSET :offset`;
        replacements.offset = offset;
    }

    const query = `
        SELECT 
            cl.id,
            cl.transaction_date,
            cl.reference_type,
            cl.document_number,
            cl.description,
            cl.debit,
            cl.credit,
            SUM(cl.debit - cl.credit) OVER (
                ORDER BY cl.transaction_date, cl.created_at
            ) AS running_balance
        FROM client_ledger cl
        WHERE ${whereConditions}
        ORDER BY cl.transaction_date, cl.created_at
        ${limitOffset}
    `;

    const results = await sequelize.query(query, {
        replacements,
        type: "SELECT",
    });

    return results as any[];
}

/**
 * Get current pending amount for a client
 */
async function getClientBalance(
    clientId: string,
    companyId: string
): Promise<number> {
    const sequelize = ClientLedger.sequelize as Sequelize;

    const query = `
        SELECT COALESCE(SUM(debit - credit), 0) AS pending_amount
        FROM client_ledger
        WHERE client_id = :clientId AND company_id = :companyId
    `;

    const results: any = await sequelize.query(query, {
        replacements: { clientId, companyId },
        type: "SELECT",
    });

    return parseFloat(results[0]?.pending_amount || 0);
}

/**
 * Get all clients with their pending balances
 */
async function getAllClientsWithBalance(
    companyId: string,
    includeZeroBalance: boolean = false
): Promise<any[]> {
    const sequelize = ClientLedger.sequelize as Sequelize;

    const havingClause = includeZeroBalance
        ? ""
        : "HAVING SUM(cl.debit - cl.credit) != 0";

    const query = `
        SELECT 
            cl.client_id,
            SUM(cl.debit - cl.credit) AS pending_amount,
            SUM(cl.debit) AS total_debits,
            SUM(cl.credit) AS total_credits
        FROM client_ledger cl
        WHERE cl.company_id = :companyId
        GROUP BY cl.client_id
        ${havingClause}
        ORDER BY pending_amount DESC
    `;

    const results = await sequelize.query(query, {
        replacements: { companyId },
        type: "SELECT",
    });

    return results as any[];
}

/**
 * Get ledger summary for a client
 */
async function getClientLedgerSummary(
    clientId: string,
    companyId: string
): Promise<{
    totalDebits: number;
    totalCredits: number;
    currentBalance: number;
}> {
    const sequelize = ClientLedger.sequelize as Sequelize;

    const query = `
        SELECT 
            COALESCE(SUM(debit), 0) AS total_debits,
            COALESCE(SUM(credit), 0) AS total_credits,
            COALESCE(SUM(debit - credit), 0) AS current_balance
        FROM client_ledger
        WHERE client_id = :clientId AND company_id = :companyId
    `;

    const results: any = await sequelize.query(query, {
        replacements: { clientId, companyId },
        type: "SELECT",
    });

    return {
        totalDebits: parseFloat(results[0]?.total_debits || 0),
        totalCredits: parseFloat(results[0]?.total_credits || 0),
        currentBalance: parseFloat(results[0]?.current_balance || 0),
    };
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * Get client ledger with running balance
 * GET /api/clients/:clientId/ledger
 */
export const getClientLedgerHandler = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.params;
        const companyId = (req as any).companyId;
        const { fromDate, toDate, limit, offset } = req.query;

        // Ensure clientId is a string
        if (typeof clientId !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid client ID",
            });
        }

        // Validate client exists and belongs to company
        const client = await Clients.findOne({
            where: {
                id: clientId,
                companyId,
                isDeleted: false,
            },
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found",
            });
        }

        // Parse dates if provided
        const parsedFromDate = fromDate ? new Date(fromDate as string) : undefined;
        const parsedToDate = toDate ? new Date(toDate as string) : undefined;

        // Parse pagination
        const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
        const parsedOffset = offset ? parseInt(offset as string, 10) : undefined;

        // Get ledger entries
        const ledgerEntries = await getClientLedger(
            clientId,
            companyId,
            parsedFromDate,
            parsedToDate,
            parsedLimit,
            parsedOffset
        );

        return successResponse(res, {
            clientId,
            clientName: `${client.clientfirstName} ${client.clientLastName}`,
            businessName: client.businessName,
            entries: ledgerEntries,
        }, "Client ledger retrieved successfully");
    } catch (error: any) {
        console.error("Error fetching client ledger:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch client ledger",
            error: error.message,
        });
    }
};

/**
 * Get client balance (pending amount)
 * GET /api/clients/:clientId/balance
 */
export const getClientBalanceHandler = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.params;
        const companyId = (req as any).companyId;

        // Ensure clientId is a string
        if (typeof clientId !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid client ID",
            });
        }

        // Validate client exists and belongs to company
        const client = await Clients.findOne({
            where: {
                id: clientId,
                companyId,
                isDeleted: false,
            },
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found",
            });
        }

        // Get balance
        const balance = await getClientBalance(clientId, companyId);

        return successResponse(res, {
            clientId,
            clientName: `${client.clientfirstName} ${client.clientLastName}`,
            businessName: client.businessName,
            pendingAmount: balance,
            status: balance > 0 ? "Receivable" : balance < 0 ? "Advance" : "Settled",
        }, "Client balance retrieved successfully");
    } catch (error: any) {
        console.error("Error fetching client balance:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch client balance",
            error: error.message,
        });
    }
};

/**
 * Get ledger summary for a client
 * GET /api/clients/:clientId/ledger/summary
 */
export const getClientLedgerSummaryHandler = async (req: Request, res: Response) => {
    try {
        const { clientId } = req.params;
        const companyId = (req as any).companyId;

        // Ensure clientId is a string
        if (typeof clientId !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid client ID",
            });
        }

        // Validate client exists and belongs to company
        const client = await Clients.findOne({
            where: {
                id: clientId,
                companyId,
                isDeleted: false,
            },
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found",
            });
        }

        // Get summary
        const summary = await getClientLedgerSummary(clientId, companyId);

        return successResponse(res, {
            clientId,
            clientName: `${client.clientfirstName} ${client.clientLastName}`,
            businessName: client.businessName,
            ...summary,
        }, "Client ledger summary retrieved successfully");
    } catch (error: any) {
        console.error("Error fetching client ledger summary:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch ledger summary",
            error: error.message,
        });
    }
};

/**
 * Get all clients with their pending balances
 * GET /api/clients/ledger/balances
 */
export const getAllClientsWithBalanceHandler = async (req: Request, res: Response) => {
    try {
        const companyId = (req as any).companyId;
        const { includeZeroBalance } = req.query;

        const includeZero = includeZeroBalance === "true" || includeZeroBalance === "1";

        // Get all clients with balances
        const clientBalances = await getAllClientsWithBalance(companyId, includeZero);

        // Fetch client details
        const clientIds = clientBalances.map((cb: any) => cb.client_id);
        const clients = await Clients.findAll({
            where: {
                id: clientIds,
                isDeleted: false,
            },
            attributes: ["id", "clientfirstName", "clientLastName", "businessName", "email", "contact"],
        });

        // Map client details to balances
        const clientsMap = new Map(clients.map((c) => [c.id, c]));
        const result = clientBalances.map((cb: any) => {
            const client = clientsMap.get(cb.client_id);
            return {
                clientId: cb.client_id,
                clientName: client
                    ? `${client.clientfirstName} ${client.clientLastName}`
                    : "Unknown",
                businessName: client?.businessName || "Unknown",
                email: client?.email,
                contact: client?.contact,
                pendingAmount: parseFloat(cb.pending_amount),
                totalDebits: parseFloat(cb.total_debits),
                totalCredits: parseFloat(cb.total_credits),
                status:
                    parseFloat(cb.pending_amount) > 0
                        ? "Receivable"
                        : parseFloat(cb.pending_amount) < 0
                        ? "Advance"
                        : "Settled",
            };
        });

        return successResponse(res, {
            count: result.length,
            clients: result,
        }, "Clients with balances retrieved successfully");
    } catch (error: any) {
        console.error("Error fetching clients with balances:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch clients with balances",
            error: error.message,
        });
    }
};
