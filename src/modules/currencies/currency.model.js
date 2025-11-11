module.exports = (sequelize, DataTypes) => {
  sequelize.define(
    "Currency",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: DataTypes.STRING, allowNull: false, unique: true }, // e.g., "USD", "INR"
    },
    {
      timestamps: true, // Adds createdAt and updatedAt columns
    }
  );
};
