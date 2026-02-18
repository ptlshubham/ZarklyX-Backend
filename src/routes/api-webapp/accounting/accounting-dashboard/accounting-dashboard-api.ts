import { Router, Request, Response } from "express";
import { authMiddleware } from "../../../../middleware/auth.middleware";
import {
    getDashboardSummary,
    getRecentInvoices,
    getBalanceOverTime,
    getInvoiceStatusBreakdown,
    getTopClientsByRevenue,
    getPaymentTrends,
} from "./accounting-dashboard-handler";
import dbInstance from "../../../../db/core/control-db";

const accountingDashboardRouter = Router();

/**
 * GET /api/accounting/dashboard/summary?companyId=xxx
 * Get dashboard summary statistics (counts and financial metrics)
 */
accountingDashboardRouter.get(
    "/summary",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            const summary = await getDashboardSummary(
                companyId as string,
                t
            );

            await t.commit();
            return res.status(200).json({
                message: "Dashboard summary retrieved successfully",
                data: summary
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting dashboard summary:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

/**
 * GET /api/accounting/dashboard/recent-invoices?companyId=xxx&limit=10
 * Get recent invoices with status
 */
accountingDashboardRouter.get(
    "/recent-invoices",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId, limit } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            const invoiceLimit = limit ? parseInt(limit as string) : 10;

            const recentInvoices = await getRecentInvoices(
                companyId as string,
                invoiceLimit,
                t
            );

            await t.commit();
            return res.status(200).json({
                message: "Recent invoices retrieved successfully",
                data: recentInvoices
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting recent invoices:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

/**
 * GET /api/accounting/dashboard/balance-over-time?companyId=xxx&period=month
 * Get balance data over time for chart
 * period: today | week | month | year
 */
accountingDashboardRouter.get(
    "/balance-over-time",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId, period } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            const validPeriods = ["today", "week", "month", "year"];
            const selectedPeriod = (period as string) || "month";

            if (!validPeriods.includes(selectedPeriod)) {
                await t.rollback();
                return res.status(400).json({
                    message: "Invalid period. Must be one of: today, week, month, year"
                });
            }

            const balanceData = await getBalanceOverTime(
                companyId as string,
                selectedPeriod as "today" | "week" | "month" | "year",
                t
            );

            await t.commit();
            return res.status(200).json({
                message: "Balance data retrieved successfully",
                data: balanceData
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting balance over time:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

/**
 * GET /api/accounting/dashboard/invoice-status-breakdown?companyId=xxx
 * Get invoice counts and amounts grouped by status
 */
accountingDashboardRouter.get(
    "/invoice-status-breakdown",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            const statusBreakdown = await getInvoiceStatusBreakdown(
                companyId as string,
                t
            );

            await t.commit();
            return res.status(200).json({
                message: "Invoice status breakdown retrieved successfully",
                data: statusBreakdown
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting invoice status breakdown:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

/**
 * GET /api/accounting/dashboard/top-clients?companyId=xxx&limit=5
 * Get top clients by revenue
 */
accountingDashboardRouter.get(
    "/top-clients",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId, limit } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            const clientLimit = limit ? parseInt(limit as string) : 5;

            const topClients = await getTopClientsByRevenue(
                companyId as string,
                clientLimit,
                t
            );

            await t.commit();
            return res.status(200).json({
                message: "Top clients retrieved successfully",
                data: topClients
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting top clients:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

/**
 * GET /api/accounting/dashboard/payment-trends?companyId=xxx&months=6
 * Get payment trends over time
 */
accountingDashboardRouter.get(
    "/payment-trends",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId, months } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            const monthsCount = months ? parseInt(months as string) : 6;

            const paymentTrends = await getPaymentTrends(
                companyId as string,
                monthsCount,
                t
            );

            await t.commit();
            return res.status(200).json({
                message: "Payment trends retrieved successfully",
                data: paymentTrends
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting payment trends:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

/**
 * GET /api/accounting/dashboard/all?companyId=xxx
 * Get all dashboard data in a single request
 */
accountingDashboardRouter.get(
    "/all",
    authMiddleware,
    async (req: Request, res: Response) => {
        const t = await dbInstance.transaction();
        try {
            const { companyId } = req.query;

            if (!companyId) {
                await t.rollback();
                return res.status(400).json({
                    message: "Company ID is required"
                });
            }

            // Fetch all dashboard data in parallel
            const [
                summary,
                recentInvoices,
                balanceOverTime,
                statusBreakdown,
                topClients,
                paymentTrends,
            ] = await Promise.all([
                getDashboardSummary(companyId as string, t),
                getRecentInvoices(companyId as string, 10, t),
                getBalanceOverTime(companyId as string, "month", t),
                getInvoiceStatusBreakdown(companyId as string, t),
                getTopClientsByRevenue(companyId as string, 5, t),
                getPaymentTrends(companyId as string, 6, t),
            ]);

            const dashboardData = {
                summary,
                recentInvoices,
                balanceOverTime,
                statusBreakdown,
                topClients,
                paymentTrends,
            };

            await t.commit();
            return res.status(200).json({
                message: "Dashboard data retrieved successfully",
                data: dashboardData
            });
        } catch (error: any) {
            await t.rollback();
            console.error("Error getting dashboard data:", error);
            return res.status(500).json({
                message: error.message || "Internal server error"
            });
        }
    }
);

export default accountingDashboardRouter;
