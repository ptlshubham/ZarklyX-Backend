module.exports = (sequelize, DataTypes) => {
  sequelize.define(
    "Sell",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      UserId: { type: DataTypes.INTEGER, allowNull: false },
      sellType: { type: DataTypes.ENUM("Normal", "Hot"), allowNull: false },
      isri: { type: DataTypes.STRING },
      sellTitle: { type: DataTypes.STRING, allowNull: false },
      quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      packing: { type: DataTypes.STRING },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      portOfShipment: { type: DataTypes.STRING, allowNull: false },
      detailedDescription: { type: DataTypes.TEXT, allowNull: false },
      country: { type: DataTypes.STRING, allowNull: false },
      state: { type: DataTypes.STRING, allowNull: false },
      city: { type: DataTypes.STRING, allowNull: false },
      images: { type: DataTypes.JSON, defaultValue: [] },
      videoUrl: { type: DataTypes.STRING },
      ScrapeCategory: { type: DataTypes.STRING, allowNull: false },
      SubCategory: { type: DataTypes.STRING, allowNull: false },
      Unit: { type: DataTypes.STRING, allowNull: false },
      Currency: { type: DataTypes.STRING, allowNull: false },
      PaymentTerm: { type: DataTypes.STRING, allowNull: false },
      PriceTerm: { type: DataTypes.STRING, allowNull: false },
    },
    {
      timestamps: true, // Adds createdAt and updatedAt columns
    }
  );
};
