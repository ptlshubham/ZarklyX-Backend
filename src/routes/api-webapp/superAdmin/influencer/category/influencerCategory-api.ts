import express from "express"
import dbInstance from "../../../../../db/core/control-db";
import { serverError } from "../../../../../services/response";
import { 
    createInfluencerCategory, 
    getAllInfluencerCategory,
    getInfluencerCategoryById, 
    getActiveInfluencerCategory,
    updateInfluencerCategory,
    softDeleteInfluencerCategory,
    setActiveInfluencerCategory,
    hardDeleteInfluencerCategory, 
} from "./influencerCategory-handler";

const router = express.Router();

//Create - add new Influencer category
router.post("/addInfluencerCategory", async (req,res) : Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const data = await createInfluencerCategory(req.body, t);
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Influencer Category added successfully.", 
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
            message: "This Influencer Category is already registered.",
            field: "name",
          });
        }
        console.error("Influencer Category add Error:", error);
        return serverError(res, "Something went wrong during Influencer Category creation.");
    };
})

//Read - get all influencer category
router.get("/getAllInfluencerCategory", async (req, res): Promise<any> => {
  try {
    const modules = await getAllInfluencerCategory(req.body, null);
    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: modules,
    });
  } catch (error) {
    console.error("Category getAll Error:", error);
    return serverError(res, "Something went wrong during Category retrieval.");
  }
});

//Read - get all active influencer category
router.get("/getActiveInfluencerCategory", async (req, res): Promise<any> => {
  try {
    const categories = await getActiveInfluencerCategory(req.body, null);
    return res.status(200).json({
      success: true,
      message: "Active categories retrieved successfully.",
      data: categories,
    });
  } catch (error) {
    console.error("Category getActive Error:", error);
    return serverError(res, "Something went wrong during active category retrieval.");
  }
});

//Read - get influencer category by ID
router.get("/getInfluencerCategory/:id", async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required.",
      });
    }

    const category = await getInfluencerCategoryById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Influencer Category not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: category,
    });
  } catch (error) {
    console.error("Category getById Error:", error);
    return serverError(res, "Something went wrong during category retrieval.");
  }
});

//Update - update influencer category
router.put("/updateInfluencerCategory/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required.",
      });
    }

    // Check if category exists
    const existingCategory = await getInfluencerCategoryById(id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Influencer Category not found.",
      });
    }

    const [updatedRows] = await updateInfluencerCategory(id, req.body, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "No changes made to the category.",
      });
    }

    await t.commit();
    
    // Fetch updated data
    const updatedCategory = await getInfluencerCategoryById(id);
    
    return res.status(200).json({
      success: true,
      message: "Influencer Category updated successfully.",
      data: updatedCategory,
    });
  } catch (error: any) {
    await t.rollback();
    if (
      error.name === "SequelizeUniqueConstraintError" &&
      error.errors?.some((e: any) => e.path === "name")
    ) {
      return res.status(409).json({
        success: false,
        message: "This Influencer Category name is already in use.",
        field: "name",
      });
    }
    console.error("Influencer Category update Error:", error);
    return serverError(res, "Something went wrong during Influencer Category update.");
  }
});

//Soft Delete - deactivate influencer category
router.patch("/softDeleteInfluencerCategory/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required.",
      });
    }

    // Check if category exists
    const existingCategory = await getInfluencerCategoryById(id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Influencer Category not found.",
      });
    }

    const [updatedRows] = await softDeleteInfluencerCategory(id, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Category could not be deactivated.",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Category deactivated successfully.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Category soft delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Category deactivation.");
  }
});

//Soft Active - activate influencer category
router.patch("/setActiveInfluencerCategory/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required.",
      });
    }

    // Check if category exists
    const existingCategory = await getInfluencerCategoryById(id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Influencer Category not found.",
      });
    }

    const [updatedRows] = await setActiveInfluencerCategory(id, t);
    if (updatedRows === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Category could not be deactivated.",
      });
    }
    
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Category deactivated successfully.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Category soft delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Category deactivation.");
  }
});

//Hard Delete - permanently delete Influencer category
router.delete("/hardDeleteInfluencerCategory/:id", async (req, res): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required.",
      });
    }

    const deletedRows = await hardDeleteInfluencerCategory(id, t);
    if (deletedRows === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Influencer Category not found.",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Influencer Category deleted permanently.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("Influencer Category hard delete Error:", error);
    return serverError(res, "Something went wrong during Influencer Category deletion.");
  }
});

export default router;
