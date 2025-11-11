module.exports = (sequelize, DataTypes) => {
  sequelize.define(
    "PaymentTerm",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true }, // e.g., "L/C (Letter of Credit)"
    },
    {
      timestamps: true, // Adds createdAt and updatedAt columns
    }
  );
};
