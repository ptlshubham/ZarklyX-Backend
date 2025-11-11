const fs = require("fs").promises;
const path = require("path");
const createError = require("http-errors");

/**
 * Creates a new sell record.
 * Handles dynamic creation of SubCategory and PaymentTerm if 'other' is selected.
 */
const createSell = async (sequelize, sellData, files, user) => {
  const { Sell } = sequelize.models;

  sellData.UserId = user.id;
  sellData.images = files.map((file) => file.path);

  return Sell.create(sellData);
};

/**
 * Deletes a specific image from a sell record.
 */
const deleteSellImage = async (sequelize, sellId, imagePathToDelete) => {
  const { Sell } = sequelize.models;
  const sell = await Sell.findByPk(sellId);

  if (!sell) {
    throw createError(404, "Sell record not found");
  }

  const currentImages = sell.images || [];
  if (!currentImages.includes(imagePathToDelete)) {
    throw createError(404, "Image not found in this record");
  }

  try {
    await fs.unlink(path.resolve(imagePathToDelete));
  } catch (error) {
    console.error(
      `Failed to delete file from disk, but continuing DB update: ${error.message}`
    );
  }

  const updatedImages = currentImages.filter((p) => p !== imagePathToDelete);
  sell.images = updatedImages;

  await sell.save();
  return sell;
};

/**
 * Retrieves all sell records with associated data.
 * @param {object} sequelize - The Sequelize instance.
 * @returns {Promise<Array>} A list of all sell records.
 */
const getAllSells = async (sequelize) => {
  const { Sell } = sequelize.models;

  const sells = await Sell.findAll({
    order: [["createdAt", "DESC"]], // Show the newest sells first
  });

  return sells;
};

module.exports = {
  createSell,
  deleteSellImage,
  getAllSells,
};
