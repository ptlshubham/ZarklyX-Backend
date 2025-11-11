module.exports = (sequelize, DataTypes) => {
  sequelize.define(
    "ScrapeCategory",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
    },
    {
      timestamps: true, // Adds createdAt and updatedAt columns
    }
  );
};
