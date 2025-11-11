const createError = require("http-errors");
const sellService = require("./sell.service");

/**
 * Controller to handle the creation of a new sell record.
 */
const createSell = async (req, res, next) => {
  try {
    const sell = await sellService.createSell(
      req.app.get("sequelize"),
      req.body,
      req.files,
      req.user
    );
    res.status(201).json({ success: true, data: sell });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to handle the deletion of a specific image from a sell record.
 */
const deleteImage = async (req, res, next) => {
  try {
    const { sellId } = req.params;
    const { imagePath } = req.body;

    if (!imagePath) {
      return next(
        createError(400, "imagePath is required in the request body.")
      );
    }

    const updatedSell = await sellService.deleteSellImage(
      req.app.get("sequelize"),
      sellId,
      imagePath
    );
    res.status(200).json({ success: true, data: updatedSell });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to handle fetching all sell records.
 */
const getAllSells = async (req, res, next) => {
  try {
    const sells = await sellService.getAllSells(req.app.get("sequelize"));
    res.status(200).json({ success: true, data: sells });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSell,
  deleteImage,
  getAllSells,
};
