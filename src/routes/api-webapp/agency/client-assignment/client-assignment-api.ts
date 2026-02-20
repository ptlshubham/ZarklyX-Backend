import express from "express";
// import { tokenMiddleWare } from "../../../../services/jwtToken-service";
import {
    getAvailableManagers,
    getAvailableEmployees,
    assignUsersToClient,
    partiallyUpdateClientAssignments,
    getAssignedUsersForClient,
    getAvailableForClient,
} from "./client-assignment-handler";
import { errorResponse, successResponse } from "../../../../utils/responseHandler";
const router = express.Router();

// TODO: need to add tokenMiddlerWare
router.get("/managers/:clientId", async (req, res) => {
    try {
        const data = await getAvailableManagers(req.params.clientId);
        return successResponse(res, "Available managers fetched successfully", data);
    } catch (error: any) {
        return errorResponse(res, error.message || "Failed to fetch available managers", null, 400);
    }
});

// TODO: need to add tokenMiddlerWare
router.get("/employees/:clientId", async (req, res) => {
    try {
        const data = await getAvailableEmployees(req.params.clientId);
        return successResponse(res, "Available employees fetched successfully", data);
    } catch (error: any) {
        return errorResponse(res, error.message || "Failed to fetch available employees", null, 400);
    }
});

// TODO: need to add tokenMiddlerWare
router.post("/assign/:clientId", async (req, res) => {
    try {
        const { managerIds = [], employeeIds = [], userId } = req.body;

        // Validate user is authenticated
        // if (!(req as any).user || !(req as any).user.id) {
        //   return res.status(401).json({ 
        //     success: false, 
        //     message: "Unauthorized: User not authenticated" 
        //   });
        // }
        if (!userId) {
            return errorResponse(res, "userId is required", null, 400);
        }
        await assignUsersToClient(
            req.params.clientId,
            managerIds,
            employeeIds,
            //   (req as any).user.id,
            userId
        );

        return successResponse(res, "Client team assigned successfully", null);
    } catch (error: any) {
        return errorResponse(res, error.message || "Failed to assign client team", null, 400);
    }
});

// TODO: need to add tokenMiddlerWare
// PATCH route for partial assignment updates (add/remove specific users)
router.patch("/assignments/:clientId", async (req, res) => {
    try {
        const userId=req.body.userId;
        if (!userId) {
            return errorResponse(res, "userId is required", null, 400);
        }
        // if (!(req as any).user?.id) {
        //     return res.status(401).json({
        //         success: false,
        //         message: "Unauthorized: User not authenticated",
        //     });
        // }

        await partiallyUpdateClientAssignments(
            req.params.clientId,
            req.body,
            userId
        );

       return successResponse(res, "Client assignments updated successfully", null);
    } catch (error: any) {
        return errorResponse(res, error.message || "Failed to update assignments", null, 400);
    }
});

// Add this to client-assignment-api.ts
router.get("/assigned/:clientId", async (req, res) => {
  try {
    const data = await getAssignedUsersForClient(req.params.clientId);
    return successResponse(res, "Assigned users fetched successfully", data);
  } catch (error: any) {
    return errorResponse(res, error.message || "Failed to fetch assigned users", null, 400);
  }
});

// Combined available managers + employees for a client
router.get("/available/:clientId", async (req, res) => {
    try {
        const data = await getAvailableForClient(req.params.clientId);
        return successResponse(res, "Available users fetched successfully", data);
    } catch (error: any) {
        return errorResponse(res, error.message || "Failed to fetch available users for client", null, 400);
    }
});

export default router;