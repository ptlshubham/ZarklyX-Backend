// notification-model.ts
import { DataTypes, Model, Sequelize, CreationOptional } from 'sequelize';

export class Notification extends Model {
  declare id: CreationOptional<number>;
  declare title: string;
  declare description: string;
  declare customerId: number;
  declare userId: number;
  declare readNotification: boolean;
  declare deleteNotification: boolean;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdBy: number;
  declare modifiedBy: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Notification {
    Notification.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          unique: true,
        },
        title: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        description: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        customerId: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
           userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        readNotification: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        deleteNotification: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
        isDeleted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        createdBy: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        modifiedBy: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        freezeTableName: true,
        tableName: 'Notification',
        timestamps: true,
      }
    );
    return Notification;
  }
}