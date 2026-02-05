import express from "express"
import dbInstance from "../../../../../db/core/control-db";
import { serverError } from "../../../../../services/response";
import { 
    createInfluencerPlatform, 
    getAllInfluencerPlatform,
    getInfluencerPlatformById, 
    getActiveInfluencerPlatform,
    updateInfluencerPlatform,
    softDeleteInfluencerPlatform,
    setActiveInfluencerPlatform,
    hardDeleteInfluencerPlatform, 
} from "./influencerPlatform-handler";

const router = express.Router();

//Create - add new Influencer Platform
router.post("/addInfluencerPlatform", async (req,res) : Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createInfluencerPlatform(req.body, t);
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Influencer Platform added successfully.", 
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
            message: "This Influencer Platform is already registered.",
            field: "name",
          });
        }
        console.error("Influencer Platform add Error:", error);
        return serverError(res, "Something went wrong during Influencer Platform creation.");
    };
})

//Read - get all influencer Platform
router.get("/getAllInfluencerPlatform", async (req, res): Promise<any> => {
  try {
    const modules = await getAllInfluencerPlatform(req.body, null);
    return res.status(200).json({
      success: true,
      message: "Platform retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("Platform getAll Error:", error);
    return serverError(res, "Something went wrong during Platform retrieval.");
  }
});

//Read - get all active influencer Platform
router.get("/getActiveInfluencerPlatform", async (req, res): Promise<any> => {
  try {
    const platforms = await getActiveInfluencerPlatform(req.body, null);
    return res.status(200).json({
      success: true,
      message: "Active platforms retrieved successfully.",
      data: platforms,
    });
  } catch (error) {
    console.error("Platform getActive Error:", error);
    return serverError(res, "Something went wrong during active Platform retrieval.");
  }
});

//Read - get influencer Platform by ID
router.get("/getInfluencerPlatform/:id", async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Platform ID is required.",
      });
    }

    const Platform = await getInfluencerPlatformById(id);
    if (!Platform) {
      return res.status(404).json({
        success: false,
        message: "Influencer Platform not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Platform retrieved successfully.",
      data: Platform,
    });
  } catch (error) {
    console.error("Platform getById Error:", error);
    return serverError(res, "Something went wrong during Platform retrieval.");
  }
});

//Update - update influencer Platform
router.put("/updateInfluencerPlatform/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Platform ID is required.",
      });
    }

    // Check if Platform exists
    const existingPlatform = await getInfluencerPlatformById(id);
    if (!existingPlatform) {
      return res.status(404).json({
        success: false,
        message: "Influencer Platform not found.",
      });
    }

    const [updatedRows] = await updateInfluencerPlatform(id, req.body, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "No changes made to the Platform.",
      });
    }

    await t.commit();
    
    // Fetch updated data
    const updatedPlatform = await getInfluencerPlatformById(id);
    
    return res.status(200).json({
      success: true,
      message: "Influencer Platform updated successfully.",
      data: updatedPlatform,
    });
  } catch (error: any) {
    await t.rollback();
    if (
      error.name === "SequelizeUniqueConstraintError" &&
      error.errors?.some((e: any) => e.path === "name")
    ) {
      return res.status(409).json({
        success: false,
        message: "This Influencer Platform name is already in use.",
        field: "name",
      });
    }
    console.error("Influencer Platform update Error:", error);
    return serverError(res, "Something went wrong during Influencer Platform update.");
  }
});

//Soft Delete - deactivate influencer Platform
router.patch("/softDeleteInfluencerPlatform/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Platform ID is required.",
      });
    }

    // Check if Platform exists
    const existingPlatform = await getInfluencerPlatformById(id);
    if (!existingPlatform) {
      return res.status(404).json({
        success: false,
        message: "Influencer Platform not found.",
      });
    }

    const [updatedRows] = await softDeleteInfluencerPlatform(id, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Platform could not be deactivated.",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Platform deactivated successfully.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Platform soft delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Platform deactivation.");
  }
});

//Soft Active - activate influencer Platform
router.patch("/setActiveInfluencerPlatform/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Platform ID is required.",
      });
    }

    // Check if Platform exists
    const existingPlatform = await getInfluencerPlatformById(id);
    if (!existingPlatform) {
      return res.status(404).json({
        success: false,
        message: "Influencer Platform not found.",
      });
    }

    const [updatedRows] = await setActiveInfluencerPlatform(id, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Platform could not be activated.",
      });
    }
    
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Platform activated successfully.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Platform activation Error:", error);
    return serverError(res, "Something went wrong during Influencer Platform activation.");
  }
});

//Hard Delete - permanently delete Influencer Platform
router.delete("/hardDeleteInfluencerPlatform/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Platform ID is required.",
      });
    }

    const deletedRows = await hardDeleteInfluencerPlatform(id, t);
    if (deletedRows === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Influencer Platform not found.",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Platform deleted permanently.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Platform hard delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Platform deletion.");
  }
});

export default router;