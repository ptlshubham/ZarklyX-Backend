import express, { Request, Response } from "express";
import dbInstance from "../../../../../db/core/control-db";
import { serverError, alreadyExist } from "../../../../../utils/responseHandler";
import {
 addInfluencerCategory,
 getInfluencerCategoryByID,
 getAllInfluencerCategorys,
 updateInfluencerCategory,
 deleteInfluencerCategory,
 getInfluencerCategoryByName

} from "./influencer-category-handler";

const router = express.Router();
// Add InfluencerCategory
 
router.post("/addInfluencerCategory", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { name } = req.body;

    if (!name) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const exists = await getInfluencerCategoryByName(name);
    if (exists) {
      await t.rollback();
      return alreadyExist(res, "InfluencerCategory already exists.");
    }

    const data = await addInfluencerCategory({ name }, t);
    await t.commit();

    res.status(201).json({
      success: true,
      message: "InfluencerCategory created successfully",
      data,
    });
  } catch (err: any) {
    await t.rollback();
    serverError(res, "somthing went wrong during all influencer Category add");
  }
});


 //Get All Active Categories
router.get("/getAllInluencerCategories", async (req: Request, res: Response) => {
  try {
    const data = await getAllInfluencerCategorys();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    serverError(res, "Something went wrong during Category retrieval");
  }
});

router.get("/getByInfluencerCategoryId/:id", async (req, res): Promise<any> => {
  try {
    const moduleData = await getInfluencerCategoryByID(req.params);
    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: moduleData,
    });
  } catch (error) {
    console.error("Category getById Error:", error);
    return serverError(res, "Something went wrong during Category retrieval by id.");
  }
});

 //Update InfluencerCategory
router.put("/updateInfluencerCategoryById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
     const exists = await getInfluencerCategoryByName(req.body.name);
    if (exists) {
      await t.rollback();
      return alreadyExist(res, "InfluencerCategory already exists.");
    }

    await updateInfluencerCategory(req.params.id, req.body, t);
    await t.commit();
    res.json({ success: true, message: "Influencer Category updated successfully" });
  } catch (err: any) {
    await t.rollback();
    serverError(res, "somthig wrong when category update");
  }
});

//delete category by id
router.get("/deleteInfluencerCategoryById/:id", async (req: Request, res: Response) => {
  try {
  const t = await dbInstance.transaction();
    await deleteInfluencerCategory(req.params.id,t);
    await t.commit();

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (err: any) {
    serverError(res, "somthig wrong when category delete");
  }
});

export default router;
