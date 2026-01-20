import { Router, Request, Response } from "express";
import {
  appendAnalyzeState,
  deleteAnalyzeFile,
  createAnalyzeFile,
  readAnalyzeData,
  findLatestEntry,
  listCategoriesForUrl,
  fileExists,
} from "./storeFile-handler";
import { serverError } from "services/response";

const router = Router();

/* ---------------- CREATE/SAVE SEO DATA ---------------- */
router.post("/save", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category, seoData } = req.body;

    if (!url || !category || !seoData) {
      return res.status(400).json({
        success: false,
        message: "url, category, and seoData are required",
      });
    }

    await appendAnalyzeState(url, category, seoData);

    return res.json({
      success: true,
      message: "SEO data saved successfully",
      url,
      category,
    });
  } catch (error) {
    serverError(res, "Error saving SEO data");
  }
});

/* ---------------- GET ALL SEO DATA ---------------- */
router.get("/data", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category } = req.query;

    if (!url || !category) {
      return res.status(400).json({
        success: false,
        message: "url and category are required",
      });
    }

    const data = await readAnalyzeData(url as string, category as string);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "No data found",
      });
    }

    return res.json({
      success: true,
      url,
      category,
      data,
      count: data.length,
    });
  } catch (error) {
    serverError(res, "Error reading SEO data");
  }
});

/* ---------------- GET LATEST ENTRY ---------------- */
router.get("/latest", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category } = req.query;

    if (!url || !category) {
      return res.status(400).json({
        success: false,
        message: "url and category are required",
      });
    }

    const data = await findLatestEntry(url as string, category as string);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "No data found",
      });
    }

    return res.json({
      success: true,
      url,
      category,
      data,
    });
  } catch (error) {
    serverError(res, "Error reading latest SEO data");
  }
});

/* ---------------- LIST CATEGORIES FOR URL ---------------- */
router.get("/categories", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "url is required",
      });
    }

    const categories = await listCategoriesForUrl(url as string);

    return res.json({
      success: true,
      url,
      categories,
      count: categories.length,
    });
  } catch (error) {
    serverError(res, "Error listing categories");
  }
});

/* ---------------- DELETE ANALYZE FILE ---------------- */
router.delete("/delete", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category } = req.body;

    if (!url || !category) {
      return res.status(400).json({
        success: false,
        message: "url and category are required",
      });
    }

    const deleted = await deleteAnalyzeFile(url, category);

    return res.json({
      success: deleted,
      message: deleted ? "File deleted successfully" : "Failed to delete file",
    });
  } catch (error) {
    serverError(res, "Error deleting file");
  }
});

/* ---------------- CREATE EMPTY FILE ---------------- */
router.post("/create", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category } = req.body;

    if (!url || !category) {
      return res.status(400).json({
        success: false,
        message: "url and category are required",
      });
    }

    const created = await createAnalyzeFile(url, category);

    return res.json({
      success: created,
      message: created ? "File created successfully" : "Failed to create file",
    });
  } catch (error) {
    serverError(res, "Error creating file");
  }
});

/* ---------------- DELETE AND CREATE FILE (RESET) ---------------- */
router.post("/reset", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category } = req.body;

    if (!url || !category) {
      return res.status(400).json({
        success: false,
        message: "url and category are required",
      });
    }

    const deleted = await deleteAnalyzeFile(url, category);
    const created = await createAnalyzeFile(url, category);

    return res.json({
      success: deleted && created,
      message:
        deleted && created
          ? "File reset successfully"
          : "Failed to reset file",
    });
  } catch (error) {
    serverError(res, "Error resetting file");
  }
});

/* ---------------- CHECK IF FILE EXISTS ---------------- */
router.get("/exists", async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, category } = req.query;

    if (!url || !category) {
      return res.status(400).json({
        success: false,
        message: "url and category are required",
      });
    }

    const exists = await fileExists(url as string, category as string);

    return res.json({
      success: true,
      exists,
      url,
      category,
    });
  } catch (error) {
    serverError(res, "Error checking file existence");
  }
});

export default router;