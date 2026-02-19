import express, { Request, Response } from 'express';
import {
    getTicketStatsCounts,
    getTicketStatsList,
    getTicketStatsTimeline,
    getTicketStatsPriority,
    getTicketStatsDailyReport,
    getAverageCompletionTime,
} from "./ticket-dashboard-handler";
import { serverError, successResponse,unauthorized,errorResponse } from "../../../../utils/responseHandler";
import { authMiddleware } from '../../../../middleware/auth.middleware';
const router = express.Router();

// GET /tickets/stats/count
router.get("/count", async (req: Request, res: Response): Promise<any> => {
    try{
        const { userId, userRole , companyId,clientId} = req.query;
        if(!userId || !userRole){
            return errorResponse(res, "userId and userRole are required", null, 400);
        }
        const stats=await getTicketStatsCounts(userId as string, userRole as string, companyId as string, clientId as string);
        return successResponse(res, "Ticket stats counts are retrieved successfully", stats);
    } catch (error) {
        console.error("Error fetching ticket stats counts:", error);
        return serverError(res, "Failed to fetch ticket stats counts");
    }
});
//GET /tickets/stats/timeline
router.get("/timeline", async (req: Request, res: Response): Promise<any> => {
    try{
        const {userId,userRole, companyId}=req.query;
        const currentDate=new Date();
        const month=currentDate.getMonth()+1,year=currentDate.getFullYear();
        if(!userId || !userRole || !companyId){
            return errorResponse(res, "userId, userRole and companyId are required", null, 400);
        }
        const timeline=await getTicketStatsTimeline(userId as string,userRole as string, companyId as string, month,year);
        return successResponse(res, "Ticket stats timeline retrieved successfully", {data: timeline});
    }
    catch(error)
    {
        console.error("Error fetching ticket stats timeline:", error);
        return serverError(res, "Failed to fetch ticket stats timeline");
    }
});
//GET /tickets/stats/priority
router.get("/priority",async (req:Request,res:Response) :Promise<any>=>{
    try{
        const {userId,userRole, companyId}=req.query;
        if(!userId || !userRole || !companyId){
            return errorResponse(res, "userId, userRole and companyId are required", null, 400);
        }
        const priorityStats=await getTicketStatsPriority( userId as string, userRole as string, companyId as string);
        return successResponse(res, "Ticket stats by priority retrieved successfully", {data: priorityStats});
    }
    catch(error){
        console.error("Error fetching ticket stats by priority:", error);
        return serverError(res, "Failed to fetch ticket stats by priority");
    }
})
//GET /tickets/stats/daily-report
router.get("/daily-report",async (req:Request,res:Response):Promise<any>=>{
    try{
        const {userId,userRole, companyId, date,employeeId}=req.query;
        if(!userId || !userRole || !companyId){
            return errorResponse(res, "userId, userRole and companyId are required", null, 400);
        }
        if(!date){
            return errorResponse(res, "date is required", null, 400);
        }

        const dailyReport=await getTicketStatsDailyReport(userId as string,userRole as string, companyId as string, date as string,employeeId as string);
        return successResponse(res, "Ticket stats daily report retrieved successfully", {data: dailyReport});
    }
    catch(error){
        console.error("Error fetching daily report:", error);
        return serverError(res, "Failed to fetch daily report");
    }
})

router.get("/getAverageResolutionTime",async(req:Request,res:Response):Promise<any>=>{
    try{
        const { userId, userRole, companyId ,startDate,endDate,excludeHold} = req.query;
        if (!userId || !userRole || !companyId) {
            return errorResponse(res, "userId, userRole and companyId are required", null, 400);
        }
        const now = new Date();
        const start = startDate ? new Date(startDate as string) : new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
        const end = endDate ? new Date(endDate as string) : now;

        const exclude = excludeHold === undefined
            ? true
            : (String(excludeHold).toLowerCase() === 'true' || String(excludeHold) === '1');

        const result = await getAverageCompletionTime(userId as string, userRole as string, companyId as string, start, end, exclude as boolean);
        return successResponse(res, "Average resolution time retrieved successfully", {
            avgMs: result.avgMs,
            avgDisplay: result.avgDisplay,
            count: result.count,
        });
    }
    catch(error){
        console.error("Error fetching average resolution time:", error);
        return serverError(res, "Failed to fetch average resolution time");
    }
});

export default router;