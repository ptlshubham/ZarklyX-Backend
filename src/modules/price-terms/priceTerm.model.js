module.exports = (sequelize, DataTypes) => {
  sequelize.define(
    "PriceTerm",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true }, // e.g., "FOB (Free On Board)"
    },
    {
      timestamps: true, // Adds createdAt and updatedAt columns
    }
  );
};
