import express from "express";
// import { tokenMiddleWare } from "../../../../services/jwtToken-service";
import {
    getAvailableManagers,
    getAvailableEmployees,
    assignUsersToClient,
    partiallyUpdateClientAssignments,
    getAssignedUsersForClient,
} from "./client-assignment-handler";

const router = express.Router();

// TODO: need to add tokenMiddlerWare
router.get("/managers/:clientId", async (req, res) => {
    try {
        const data = await getAvailableManagers(req.params.clientId);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(400).json({
            success: false,
            message: error.message || "Failed to fetch available managers"
        });
    }
});

// TODO: need to add tokenMiddlerWare
router.get("/employees/:clientId", async (req, res) => {
    try {
        const data = await getAvailableEmployees(req.params.clientId);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(400).json({
            success: false,
            message: error.message || "Failed to fetch available employees"
        });
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
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }
        await assignUsersToClient(
            req.params.clientId,
            managerIds,
            employeeIds,
            //   (req as any).user.id,
            userId
        );

        res.json({ success: true, message: "Client team assigned successfully" });
    } catch (error: any) {
        res.status(400).json({
            success: false,
            message: error.message || "Failed to assign client team"
        });
    }
});

// TODO: need to add tokenMiddlerWare
// PATCH route for partial assignment updates (add/remove specific users)
router.patch("/assignments/:clientId", async (req, res) => {
    try {
        const userId=req.body.userId;
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
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

        res.json({
            success: true,
            message: "Client assignments updated successfully",
        });
    } catch (error: any) {
        res.status(400).json({
            success: false,
            message: error.message || "Failed to update assignments",
        });
    }
});

// Add this to client-assignment-api.ts
router.get("/assigned/:clientId", async (req, res) => {
  try {
    const data = await getAssignedUsersForClient(req.params.clientId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch assigned users"
    });
  }
});

export default router;