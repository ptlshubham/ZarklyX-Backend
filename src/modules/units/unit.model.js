module.exports = (sequelize, DataTypes) => {
  sequelize.define(
    "Unit",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      name: { type: DataTypes.STRING, allowNull: false, unique: true }, // e.g., "Tons", "KG"
    },
    {
      timestamps: true, // Adds createdAt and updatedAt columns
    }
  );
};
