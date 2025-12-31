import express from "express";
import { Request, Response } from "express";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import { requireRole } from "../../../middleware/role.middleware";
import { Role } from "./role-model";
import { SubRole } from "./subrole-model";
import ErrorLogger from "../../../db/core/logger/error-logger";

const router = express.Router();
// router.get(
//   "/admin/roles", tokenMiddleWare, requireRole("superadmin"),
//   (req: Request, res: Response, next: any) => {
    
//         console.log("➡️ /admin/roles controller hit");
//        res.json({ success: true, message: "Roles API working" });
//     (async () => {
//       try {
//         const roles = await Role.findAll({ include: [{ model: SubRole, as: "subRoles" }] });
//         res.status(200).json({ success: true, data: roles });
//       } catch (error: any) {
//         console.error("[GET /admin/roles] ERROR:", error);
//         ErrorLogger.write({ type: "get roles error", error });
//         res.status(500).json({ success: false, message: error.message || "Failed to fetch roles." });
//       }
//     })().catch(next);
//   }
// );


router.get(
  "/admin/roles",
  tokenMiddleWare,
  requireRole("superadmin"),
  async (req: Request, res: Response, next: any) => {
    try {
      const roles = await Role.findAll({
        include: [{ model: SubRole, as: "subRoles" }],
      });

       res.status(200).json({
        success: true,
        message: "Roles API working",
        data: roles,
      });
      return;
    } catch (error: any) {
      console.error("[GET /admin/roles] ERROR:", error);

       res.status(500).json({
        success: false,
        message: "Failed to fetch roles",
      });
      return;
    }
  }
);


router.post(
  "/admin/roles", tokenMiddleWare, requireRole("superadmin"),
  (req: Request, res: Response, next: any) => {
    (async () => {
      try {
        const { name, displayName, description } = req.body;
        if (!name) { res.status(400).json({ success: false, message: "name is required" }); return; }
        const role = await Role.create({ name: String(name).toLowerCase(), displayName: displayName || null, description: description || null, isActive: true });
        res.status(201).json({ success: true, data: role });
      } catch (error: any) {
        console.error("[POST /admin/roles] ERROR:", error);
        ErrorLogger.write({ type: "create role error", error });
        res.status(500).json({ success: false, message: error.message || "Failed to create role." });
      }
    })().catch(next);
  }
);


router.put(
  "/admin/roles/:id",
  tokenMiddleWare,
  requireRole("superadmin"),
  (req: Request, res: Response, next: any) => {
    (async () => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
        const role = await Role.findByPk(id);
        if (!role) { res.status(404).json({ success: false, message: "Role not found" }); return; }
        const { displayName, description, isActive } = req.body;
        await role.update({ displayName, description, isActive });
        res.status(200).json({ success: true, data: role });
      } catch (error: any) {
        console.error("[PUT /admin/roles/:id] ERROR:", error);
        ErrorLogger.write({ type: "update role error", error });
        res.status(500).json({ success: false, message: error.message || "Failed to update role." });
      }
    })().catch(next);
  }
);


router.delete(
  "/admin/roles/:id",
  tokenMiddleWare,
  requireRole("superadmin"),
  (req: Request, res: Response, next: any) => {
    (async () => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
        const role = await Role.findByPk(id);
        if (!role) { res.status(404).json({ success: false, message: "Role not found" }); return; }
        await role.update({ isActive: false });
        res.status(200).json({ success: true, message: "Role deactivated" });
      } catch (error: any) {
        console.error("[DELETE /admin/roles/:id] ERROR:", error);
        ErrorLogger.write({ type: "delete role error", error });
        res.status(500).json({ success: false, message: error.message || "Failed to delete role." });
      }
    })().catch(next);
  }
);

// SubRole endpoints
router.post(
  "/admin/roles/:roleId/subroles",
  tokenMiddleWare,
  requireRole("superadmin"),
  (req: Request, res: Response, next: any) => {
    (async () => {
      try {
        const roleId = Number(req.params.roleId);
        if (Number.isNaN(roleId)) { res.status(400).json({ success: false, message: "Invalid roleId" }); return; }
        const role = await Role.findByPk(roleId);
        if (!role) { res.status(404).json({ success: false, message: "Role not found" }); return; }
        const { name, displayName, description } = req.body;
        if (!name) { res.status(400).json({ success: false, message: "name is required" }); return; }
        const sub = await SubRole.create({ roleId, name: String(name).toLowerCase(), displayName: displayName || null, description: description || null, isActive: true });
        res.status(201).json({ success: true, data: sub });
      } catch (error: any) {
        console.error("[POST /admin/roles/:roleId/subroles] ERROR:", error);
        ErrorLogger.write({ type: "create subrole error", error });
        res.status(500).json({ success: false, message: error.message || "Failed to create subrole." });
      }
    })().catch(next);
  }
);


router.put(
  "/admin/subroles/:id",tokenMiddleWare, requireRole("superadmin"),
  (req: Request, res: Response, next: any) => {
    (async () => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
        const sub = await SubRole.findByPk(id);
        if (!sub) { res.status(404).json({ success: false, message: "SubRole not found" }); return; }
        const { displayName, description, isActive } = req.body;
        await sub.update({ displayName, description, isActive });
        res.status(200).json({ success: true, data: sub });
      } catch (error: any) {
        console.error("[PUT /admin/subroles/:id] ERROR:", error);
        ErrorLogger.write({ type: "update subrole error", error });
        res.status(500).json({ success: false, message: error.message || "Failed to update subrole." });
      }
    })().catch(next);
  }
);


router.delete(
  "/admin/subroles/:id",tokenMiddleWare,requireRole("superadmin"),
  (req: Request, res: Response, next: any) => {
    (async () => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
        const sub = await SubRole.findByPk(id);
        if (!sub) { res.status(404).json({ success: false, message: "SubRole not found" }); return; }
        await sub.update({ isActive: false });
        res.status(200).json({ success: true, message: "SubRole deactivated" });
      } catch (error: any) {
        console.error("[DELETE /admin/subroles/:id] ERROR:", error);
        ErrorLogger.write({ type: "delete subrole error", error });
        res.status(500).json({ success: false, message: error.message || "Failed to delete subrole." });
      }
    })().catch(next);
  }
);

export default router;
