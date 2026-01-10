import express, { Request, Response } from "express";
import dbInstance from "../../../../../db/core/control-db";
import { serverError, alreadyExist } from "../../../../../utils/responseHandler";
import {
  addInfluencerIndustry,
  getInfluencerIndustryByID,
  getAllInfluencerIndustrys,
  updateInfluencerIndustry,
  deleteInfluencerIndustry,
  getInfluencerIndustryByName

} from "./influencer-industry-handler";

const router = express.Router();
// Add InfluencerIndustry

router.post("/addInfluencerIndustry", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { name, isActive = true } = req.body;

    if (!name) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const exists = await getInfluencerIndustryByName(name);
    if (exists) {
      await t.rollback();
      return alreadyExist(res, "InfluencerIndustry already exists.");
    }

    const data = await addInfluencerIndustry({ name, isActive }, t);
    await t.commit();
    res.status(201).json({
      success: true,
      message: "InfluencerIndustry created successfully",
      data,
    });
  } catch (err: any) {
    await t.rollback();
    serverError(res, "somthing went wrong during all industry add");
  }
});
// Get All Active Industry

router.get("/getAllInluencerIndustry", async (req: Request, res: Response) => {
  try {
    const data = await getAllInfluencerIndustrys();

    res.json({ success: true, data });
  } catch (err: any) {
    serverError(res, "somthing went wrong during all Industry retrieval");
  }
});


router.get("/getInfluencerIndustryById/:id", async (req, res): Promise<any> => {
  try {
    const moduleData = await getInfluencerIndustryByID(req.params);
    return res.status(200).json({
      success: true,
      message: "Industry retrieved successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Industry getById Error:", error);
    return serverError(res, "Something went wrong during Industry retrieval.");
  }
});

// Update InfluencerIndustry
router.put("/updateInfluencerIndustryById/:id", async (req: Request, res: Response): Promise<any>=> {
  const t = await dbInstance.transaction();
  try {
     const exists = await getInfluencerIndustryByName(req.body.name);
    if (exists) {
      await t.rollback();
      return alreadyExist(res, "InfluencerIndustry already exists.");
    }
    await updateInfluencerIndustry(req.params.id, req.body, t);
    await t.commit();
    res.json({ success: true, message: "InfluencerIndustry updated successfully" });
  } catch (err: any) {
    await t.rollback();
    serverError(res, "Something went wrong during industry update.");
  }
});


router.get("/deleteInfluencerIndustryById/:id", async (req: Request, res: Response) => {
  try {
    const t = await dbInstance.transaction();
    await deleteInfluencerIndustry(req.params.id, t);
    await t.commit();
    res.json({ success: true, message: "Industry deleted successfully" });
  } catch (err: any) {
    serverError(res, "somthing went wrong delete influencer industry");
  }
});

export default router;
