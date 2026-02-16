import { Transaction } from "sequelize";
import { Op } from "sequelize";
import { Clients } from "../../agency/clients/clients-model";
import { Item } from "../item/item-model";
import { Invoice } from "../invoice/invoice-model";
import { Quote } from "../quote/quote-model";
import { PurchaseOrder } from "../purchaseOrder/purchase-order-model";
import { Payments } from "../payments/payments-model";

/**
 * Get dashboard summary statistics
 */
export const getDashboardSummary = async (
    companyId: string,
    t?: Transaction
) => {
    const currentDate = new Date();

    // Count statistics
    const [
        clientsCount,
        itemsCount,
        invoicesCount,
        quotesCount,
        purchaseOrdersCount,
    ] = await Promise.all([
        Clients.count({
            where: {
                companyId,
                isDeleted: false,
            },
            transaction: t,
        }),
        Item.count({
            where: {
                companyId,
                isDeleted: false,
            },
            transaction: t,
        }),
        Invoice.count({
            where: {
                companyId,
                isDeleted: false,
            },
            transaction: t,
        }),
        Quote.count({
            where: {
                companyId,
                isDeleted: false,
            },
            transaction: t,
        }),
        PurchaseOrder.count({
            where: {
                companyId,
                isDeleted: false,
            },
            transaction: t,
        }),
    ]);

    // Financial statistics - Total invoiced
    const invoicedData = await Invoice.findOne({
        attributes: [
            [Invoice.sequelize!.fn("SUM", Invoice.sequelize!.col("total")), "totalInvoiced"],
        ],
        where: {
            companyId,
            isDeleted: false,
            status: {
                [Op.notIn]: ["Draft", "Cancelled"],
            },
        },
        transaction: t,
        raw: true,
    }) as any;

    const totalInvoiced = parseFloat(invoicedData?.totalInvoiced || "0");

    // Total paid - Sum of all Payment Received
    const paidData = await Payments.findOne({
        attributes: [
            [Payments.sequelize!.fn("SUM", Payments.sequelize!.col("paymentAmount")), "totalPaid"],
        ],
        where: {
            companyId,
            isDeleted: false,
            paymentType: "Payment Received",
        },
        transaction: t,
        raw: true,
    }) as any;

    const totalPaid = parseFloat(paidData?.totalPaid || "0");

    // Current amount (unpaid but not overdue)
    const currentData = await Invoice.findOne({
        attributes: [
            [Invoice.sequelize!.fn("SUM", Invoice.sequelize!.col("balance")), "currentAmount"],
        ],
        where: {
            companyId,
            isDeleted: false,
            status: {
                [Op.in]: ["Unpaid", "Partially Paid"],
            },
            dueDate: {
                [Op.gte]: currentDate,
            },
        },
        transaction: t,
        raw: true,
    }) as any;

    const currentAmount = parseFloat(currentData?.currentAmount || "0");

    // Overdue amount
    const overdueData = await Invoice.findOne({
        attributes: [
            [Invoice.sequelize!.fn("SUM", Invoice.sequelize!.col("balance")), "overdueAmount"],
        ],
        where: {
            companyId,
            isDeleted: false,
            status: {
                [Op.in]: ["Overdue", "Unpaid", "Partially Paid"],
            },
            dueDate: {
                [Op.lt]: currentDate,
            },
        },
        transaction: t,
        raw: true,
    }) as any;

    const overdueAmount = parseFloat(overdueData?.overdueAmount || "0");

    // Available balance (total paid - expenses/bills paid)
    // This is simplified - you may need to adjust based on your business logic
    const availableBalance = totalPaid;

    return {
        counts: {
            clients: clientsCount,
            items: itemsCount,
            invoices: invoicesCount,
            quotes: quotesCount,
            purchaseOrders: purchaseOrdersCount,
        },
        financial: {
            totalInvoiced,
            totalPaid,
            currentAmount,
            overdueAmount,
            availableBalance,
        },
    };
};

/**
 * Get recent invoices with status
 */
export const getRecentInvoices = async (
    companyId: string,
    limit: number = 10,
    t?: Transaction
) => {
    const invoices = await Invoice.findAll({
        where: {
            companyId,
            isDeleted: false,
        },
        attributes: [
            "id",
            "invoiceNo",
            "invoiceDate",
            "dueDate",
            "status",
            "total",
            "balance",
        ],
        order: [["invoiceDate", "DESC"]],
        limit,
        transaction: t,
    });

    return invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        status: invoice.status,
        date: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        amount: invoice.total,
        balance: invoice.balance,
    }));
};

/**
 * Get balance over time for chart
 */
export const getBalanceOverTime = async (
    companyId: string,
    period: "today" | "week" | "month" | "year",
    t?: Transaction
) => {
    const currentDate = new Date();
    let startDate: Date;
    let groupFormat: string;

    switch (period) {
        case "today":
            startDate = new Date(currentDate);
            startDate.setHours(0, 0, 0, 0);
            groupFormat = "%Y-%m-%d %H:00:00"; // Group by hour
            break;
        case "week":
            startDate = new Date(currentDate);
            startDate.setDate(currentDate.getDate() - 7);
            groupFormat = "%Y-%m-%d"; // Group by day
            break;
        case "month":
            startDate = new Date(currentDate);
            startDate.setDate(currentDate.getDate() - 30);
            groupFormat = "%Y-%m-%d"; // Group by day
            break;
        case "year":
            startDate = new Date(currentDate);
            startDate.setFullYear(currentDate.getFullYear() - 1);
            groupFormat = "%Y-%m"; // Group by month
            break;
        default:
            startDate = new Date(currentDate);
            startDate.setDate(currentDate.getDate() - 30);
            groupFormat = "%Y-%m-%d";
    }

    // Get cumulative payments received over time
    const paymentsData = await Payments.findAll({
        attributes: [
            [
                Payments.sequelize!.fn("DATE_FORMAT", Payments.sequelize!.col("paymentDate"), groupFormat),
                "period",
            ],
            [
                Payments.sequelize!.fn("SUM", Payments.sequelize!.col("paymentAmount")),
                "amount",
            ],
        ],
        where: {
            companyId,
            isDeleted: false,
            paymentType: "Payment Received",
            paymentDate: {
                [Op.gte]: startDate,
                [Op.lte]: currentDate,
            },
        },
        group: [
            Payments.sequelize!.fn("DATE_FORMAT", Payments.sequelize!.col("paymentDate"), groupFormat),
        ],
        order: [[Payments.sequelize!.literal("period"), "ASC"]],
        transaction: t,
        raw: true,
    }) as any[];

    // Calculate cumulative balance
    let cumulativeBalance = 0;
    const balanceData = paymentsData.map((item) => {
        cumulativeBalance += parseFloat(item.amount || "0");
        return {
            period: item.period,
            balance: cumulativeBalance,
        };
    });

    return balanceData;
};

/**
 * Get invoice status breakdown
 */
export const getInvoiceStatusBreakdown = async (
    companyId: string,
    t?: Transaction
) => {
    const statusBreakdown = await Invoice.findAll({
        attributes: [
            "status",
            [Invoice.sequelize!.fn("COUNT", Invoice.sequelize!.col("id")), "count"],
            [Invoice.sequelize!.fn("SUM", Invoice.sequelize!.col("total")), "totalAmount"],
            [Invoice.sequelize!.fn("SUM", Invoice.sequelize!.col("balance")), "totalBalance"],
        ],
        where: {
            companyId,
            isDeleted: false,
        },
        group: ["status"],
        transaction: t,
        raw: true,
    }) as any[];

    return statusBreakdown.map((item) => ({
        status: item.status,
        count: parseInt(item.count || "0"),
        totalAmount: parseFloat(item.totalAmount || "0"),
        totalBalance: parseFloat(item.totalBalance || "0"),
    }));
};

/**
 * Get top clients by revenue
 */
export const getTopClientsByRevenue = async (
    companyId: string,
    limit: number = 5,
    t?: Transaction
) => {
    const topClients = await Invoice.findAll({
        attributes: [
            "clientId",
            [Invoice.sequelize!.fn("SUM", Invoice.sequelize!.col("total")), "totalRevenue"],
            [Invoice.sequelize!.fn("COUNT", Invoice.sequelize!.col("id")), "invoiceCount"],
        ],
        where: {
            companyId,
            isDeleted: false,
            status: {
                [Op.notIn]: ["Draft", "Cancelled"],
            },
        },
        group: ["clientId"],
        order: [[Invoice.sequelize!.literal("totalRevenue"), "DESC"]],
        limit,
        include: [
            {
                model: Clients,
                as: "client",
                attributes: ["id", "clientfirstName", "clientLastName", "businessName", "email"],
            },
        ],
        transaction: t,
    }) as any[];

    return topClients.map((item) => ({
        clientId: item.clientId,
        clientName: item.client?.businessName || `${item.client?.clientfirstName || ""} ${item.client?.clientLastName || ""}`.trim(),
        email: item.client?.email || null,
        totalRevenue: parseFloat(item.dataValues.totalRevenue || "0"),
        invoiceCount: parseInt(item.dataValues.invoiceCount || "0"),
    }));
};

/**
 * Get payment trends
 */
export const getPaymentTrends = async (
    companyId: string,
    months: number = 6,
    t?: Transaction
) => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const paymentTrends = await Payments.findAll({
        attributes: [
            [
                Payments.sequelize!.fn("DATE_FORMAT", Payments.sequelize!.col("paymentDate"), "%Y-%m"),
                "month",
            ],
            "paymentType",
            [
                Payments.sequelize!.fn("SUM", Payments.sequelize!.col("paymentAmount")),
                "totalAmount",
            ],
            [
                Payments.sequelize!.fn("COUNT", Payments.sequelize!.col("id")),
                "count",
            ],
        ],
        where: {
            companyId,
            isDeleted: false,
            paymentDate: {
                [Op.gte]: startDate,
            },
        },
        group: [
            Payments.sequelize!.fn("DATE_FORMAT", Payments.sequelize!.col("paymentDate"), "%Y-%m"),
            "paymentType",
        ],
        order: [[Payments.sequelize!.literal("month"), "ASC"]],
        transaction: t,
        raw: true,
    }) as any[];

    return paymentTrends.map((item) => ({
        month: item.month,
        paymentType: item.paymentType,
        totalAmount: parseFloat(item.totalAmount || "0"),
        count: parseInt(item.count || "0"),
    }));
};
