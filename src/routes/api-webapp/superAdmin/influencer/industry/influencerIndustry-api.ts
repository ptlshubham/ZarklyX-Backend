import express from "express"
import dbInstance from "../../../../../db/core/control-db";
import { serverError } from "../../../../../services/response";
import { 
    createInfluencerIndustry, 
    getAllInfluencerIndustry,
    getInfluencerIndustryById, 
    getActiveInfluencerIndustry,
    updateInfluencerIndustry,
    softDeleteInfluencerIndustry,
    setActiveInfluencerIndustry,
    hardDeleteInfluencerIndustry, 
} from "./influencerIndustry-handler";

const router = express.Router();

//Create - add new Influencer Industry
router.post("/addInfluencerIndustry", async (req,res) : Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createInfluencerIndustry(req.body, t);
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Influencer Industry added successfully.", 
            data: data,
        });
    } catch (error: any) {
        await t.rollback();
        if (
          error.name === "SequelizeUniqueConstraintError" &&
          error.errors?.some((e: any) => e.path === "name")
        ) {
          return res.status(409).json({
            success: false,
            message: "This Influencer Industry is already registered.",
            field: "name",
          });
        }
        console.error("Influencer Industry add Error:", error);
        return serverError(res, "Something went wrong during Influencer Industry creation.");
    };
})

//Read - get all influencer Industry
router.get("/getAllInfluencerIndustry", async (req, res): Promise<any> => {
  try {
    const modules = await getAllInfluencerIndustry(req.body, null);
    return res.status(200).json({
      success: true,
      message: "Industry retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("Industry getAll Error:", error);
    return serverError(res, "Something went wrong during Industry retrieval.");
  }
});

//Read - get all active influencer Industry
router.get("/getActiveInfluencerIndustry", async (req, res): Promise<any> => {
  try {
    const categories = await getActiveInfluencerIndustry(req.body, null);
    return res.status(200).json({
      success: true,
      message: "Active categories retrieved successfully.",
      data: categories,
    });
  } catch (error) {
    console.error("Industry getActive Error:", error);
    return serverError(res, "Something went wrong during active Industry retrieval.");
  }
});

//Read - get influencer Industry by ID
router.get("/getInfluencerIndustry/:id", async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Industry ID is required.",
      });
    }

    const Industry = await getInfluencerIndustryById(id);
    if (!Industry) {
      return res.status(404).json({
        success: false,
        message: "Influencer Industry not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Industry retrieved successfully.",
      data: Industry,
    });
  } catch (error) {
    console.error("Industry getById Error:", error);
    return serverError(res, "Something went wrong during Industry retrieval.");
  }
});

//Update - update influencer Industry
router.put("/updateInfluencerIndustry/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Industry ID is required.",
      });
    }

    // Check if Industry exists
    const existingIndustry = await getInfluencerIndustryById(id);
    if (!existingIndustry) {
      return res.status(404).json({
        success: false,
        message: "Influencer Industry not found.",
      });
    }

    const [updatedRows] = await updateInfluencerIndustry(id, req.body, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "No changes made to the Industry.",
      });
    }

    await t.commit();
    
    // Fetch updated data
    const updatedIndustry = await getInfluencerIndustryById(id);
    
    return res.status(200).json({
      success: true,
      message: "Influencer Industry updated successfully.",
      data: updatedIndustry,
    });
  } catch (error: any) {
    await t.rollback();
    if (
      error.name === "SequelizeUniqueConstraintError" &&
      error.errors?.some((e: any) => e.path === "name")
    ) {
      return res.status(409).json({
        success: false,
        message: "This Influencer Industry name is already in use.",
        field: "name",
      });
    }
    console.error("Influencer Industry update Error:", error);
    return serverError(res, "Something went wrong during Influencer Industry update.");
  }
});

//Soft Delete - deactivate influencer Industry
router.patch("/softDeleteInfluencerIndustry/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Industry ID is required.",
      });
    }

    // Check if Industry exists
    const existingIndustry = await getInfluencerIndustryById(id);
    if (!existingIndustry) {
      return res.status(404).json({
        success: false,
        message: "Influencer Industry not found.",
      });
    }

    const [updatedRows] = await softDeleteInfluencerIndustry(id, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Industry could not be deactivated.",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Industry deactivated successfully.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Industry soft delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Industry deactivation.");
  }
});

//Soft Active - activate influencer Industry
router.patch("/setActiveInfluencerIndustry/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Industry ID is required.",
      });
    }

    // Check if Industry exists
    const existingIndustry = await getInfluencerIndustryById(id);
    if (!existingIndustry) {
      return res.status(404).json({
        success: false,
        message: "Influencer Industry not found.",
      });
    }

    const [updatedRows] = await setActiveInfluencerIndustry(id, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Industry could not be deactivated.",
      });
    }
    
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Industry deactivated successfully.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Industry soft delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Industry deactivation.");
  }
});

//Hard Delete - permanently delete Influencer Industry
router.delete("/hardDeleteInfluencerIndustry/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Industry ID is required.",
      });
    }

    const deletedRows = await hardDeleteInfluencerIndustry(id, t);
    if (deletedRows === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Influencer Industry not found.",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Industry deleted permanently.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Industry hard delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Industry deletion.");
  }
});

export default router;
