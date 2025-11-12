import express from "express";
import { serverError } from "../../../utils/responseHandler";
import dbInstance from "../../../db/core/control-db";
import { successResponse } from "../../../services/response";
import { addAppVersion, deleteAppVersion, getAllAppVersion, getAppVersionByID, updateAppVersion } from "./app-version-handler";
import { AnyAaaaRecord } from "dns";

const router = express.Router();

//to get all AppVersion
router.get("/getAllAppVersion", async (req, res) => {
    try {
        let getData: any = await getAllAppVersion();
        successResponse(res, getData, "Get All App Version");
        // sendEncryptedResponse(res,  getData, "Get all areas");
    } catch (error: any) {
        serverError(res, error);
    }
});

//to get AppVersion by id
router.get("/getAppVersionByID/:id", async (req, res) => {
    try {
        let getData: any = await getAppVersionByID(req.params);
        successResponse(res, getData, "Get Data Successfully by ID");
        // sendEncryptedResponse(res,  getData, "Get Data Successfully by ID");
    } catch (error: any) {
        serverError(res, error);
    }
});

//to add AppVersion
router.post("/addAppVersion", async (req: any, res) => {
    let t = await dbInstance.transaction();
    try {
        let addData: any = await addAppVersion(req.body, t);
        await t.commit();
        successResponse(res, addData, "New App Version is Added");
        // sendEncryptedResponse(res, addData, "New App Version is Added");
    } catch (error: any) {
        await t.rollback();
        serverError(res, error);
    }
});

//to update AppVersion
router.put("/updateAppVersion/:id", async (req: any, res) => {
    let t = await dbInstance.transaction();
    try {
        let updateData: any = await updateAppVersion(req.body, req.params, t);
        await t.commit();
        successResponse(res, updateData, "Data updated successfully");
        // sendEncryptedResponse(res, updateData, "Data updated successfully");
    } catch (error: any) {
        await t.rollback();
        serverError(res, error);
    }
});

//to delete AppVersion
router.delete("/deleteAppVersion/:id", async (req, res) => {
    let t = await dbInstance.transaction();
    try {
        let delData: any = await deleteAppVersion(req.params, t);
        await t.commit();
        successResponse(res, delData, "Data deleted successfully");
        // sendEncryptedResponse(res, Area, "Data Deleted successfully");

    } catch (error: any) {
        await t.rollback();
        serverError(res, error);
    }
});

module.exports = router;
