import {
    CreationOptional,
    DataTypes,
    Model,
    Sequelize
} from "sequelize";
  
  export class AppVersion extends Model {
    declare id: CreationOptional<number>;
    declare appVersion: string;
    declare forcefully: boolean | 0;
    declare appURL: string
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
  
    static initModel(sequelize: Sequelize): typeof AppVersion {
      AppVersion.init(
        {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true,
          },
          appVersion: {
            type: DataTypes.STRING(255),
          },
          forcefully: {
            type: DataTypes.BOOLEAN,
            defaultValue: 0,
          },
          appURL: {
            type: DataTypes.STRING(255)       
          },
          createdAt: {
            type: DataTypes.DATE,
          },
          updatedAt: {
            type: DataTypes.DATE,
          },
        },
        {
          sequelize,
        }
      );
  
      return AppVersion;
    }
  }

  export const initAppVersionModel = (sequelize: Sequelize) => AppVersion.initModel(sequelize);
  