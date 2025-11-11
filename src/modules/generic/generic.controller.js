const createError = require("http-errors");
const logger = require("../../utils/logger");

/**
 * A factory function to create a generic CRUD controller for a Sequelize model.
 * @param {string} modelName - The name of the Sequelize model (e.g., 'ScrapeCategory').
 * @returns {object} A controller object with full CRUD methods.
 */
const GenericController = (modelName) => {
  /**
   * Create a new item.
   */
  const create = async (req, res, next) => {
    try {
      const Model = req.app.get("sequelize").models[modelName];
      const item = await Model.create(req.body);
      logger.info(`${modelName} created with ID: ${item.id}`);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all items.
   */
  const getAll = async (req, res, next) => {
    try {
      const Model = req.app.get("sequelize").models[modelName];
      const items = await Model.findAll();
      res.status(200).json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get a single item by its ID.
   */
  const getById = async (req, res, next) => {
    try {
      const Model = req.app.get("sequelize").models[modelName];
      const item = await Model.findByPk(req.params.id);
      if (!item) {
        throw createError(404, `${modelName} not found`);
      }
      res.status(200).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update an item by its ID.
   */
  const updateById = async (req, res, next) => {
    try {
      const Model = req.app.get("sequelize").models[modelName];
      const item = await Model.findByPk(req.params.id);
      if (!item) {
        throw createError(404, `${modelName} not found`);
      }
      const updatedItem = await item.update(req.body);
      logger.info(`${modelName} with ID: ${item.id} updated`);
      res.status(200).json({ success: true, data: updatedItem });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete an item by its ID.
   */
  const deleteById = async (req, res, next) => {
    try {
      const Model = req.app.get("sequelize").models[modelName];
      const item = await Model.findByPk(req.params.id);
      if (!item) {
        throw createError(404, `${modelName} not found`);
      }
      await item.destroy(); // Performs soft delete if 'paranoid' is true
      logger.info(`${modelName} with ID: ${item.id} deleted`);
      res
        .status(200)
        .json({ success: true, message: `${modelName} deleted successfully` });
    } catch (error) {
      next(error);
    }
  };

  return {
    create,
    getAll,
    getById,
    updateById,
    deleteById,
  };
};

module.exports = GenericController;
