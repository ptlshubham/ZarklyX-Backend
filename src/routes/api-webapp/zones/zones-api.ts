import express from "express";
import dbInstance from "../../../db/core/control-db";
import { serverError, unauthorized, } from "../../../utils/responseHandler";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import { addZones } from "./zones-handler";
const router = express.Router();
export default router;
// module.exports = router;

router.post("/saveZoneDetails", tokenMiddleWare, async (req, res) => {
    console.log(req.body, 'Save');
    const t = await dbInstance.transaction();
    try {
        const zones = await addZones(req.body, t);
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Zones added successfully.",
            data: zones,
        });
    } catch (error: any) {
        await t.rollback();
        if (
            error.name === 'SequelizeUniqueConstraintError' &&
            error.errors?.some((e: any) => e.path === 'email')
        ) {
            return res.status(409).json({
                success: false,
                message: 'This email is already registered.',
                field: 'email'
            });
        }
        console.error("Zoness add Error:", error);
        return serverError(res, "Something went wrong during zones registration.");
    }
});