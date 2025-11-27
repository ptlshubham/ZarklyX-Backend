// import {
//   CreationOptional,
//   DataTypes,
//   InferCreationAttributes,
//   InferAttributes,
//   Model,
//   Sequelize,
// } from "sequelize";
// import { User } from "../../../routes/api-webapp/user/user-model";
// import { Company } from "../../../routes/api-webapp/company/company-model";

// export class UserCompany extends Model<
//   InferAttributes<UserCompany>,
//   InferCreationAttributes<UserCompany>
// > {
//   declare id: CreationOptional<number>;
//   declare userId: number;
//   declare companyId: number;
//   declare role: "admin" | "manager" | "employee" | "viewer"; // Role of user in company
//   declare isOwner: boolean; // Whether user is the company owner
//   declare status: "active" | "inactive" | "suspended"; // Status of user in company
//   declare joinedAt: CreationOptional<Date>;
//   declare createdAt: CreationOptional<Date>;
//   declare updatedAt: CreationOptional<Date>;

//   static initModel(sequelize: Sequelize): typeof UserCompany {
//     UserCompany.init(
//       {
//         id: {
//           type: DataTypes.INTEGER,
//           primaryKey: true,
//           autoIncrement: true,
//           allowNull: false,
//           unique: true,
//         },
//         userId: {
//           type: DataTypes.INTEGER,
//           allowNull: false,
//           references: {
//             model: "user",
//             key: "id",
//           },
//           onDelete: "CASCADE",
//         },
//         companyId: {
//           type: DataTypes.INTEGER,
//           allowNull: false,
//           references: {
//             model: "companies",
//             key: "id",
//           },
//           onDelete: "CASCADE",
//         },
//         role: {
//           type: DataTypes.ENUM("admin", "manager", "employee", "viewer"),
//           defaultValue: "employee",
//           allowNull: false,
//         },
//         isOwner: {
//           type: DataTypes.BOOLEAN,
//           defaultValue: false,
//           allowNull: false,
//         },
//         status: {
//           type: DataTypes.ENUM("active", "inactive", "suspended"),
//           defaultValue: "active",
//           allowNull: false,
//         },
//         joinedAt: {
//           type: DataTypes.DATE,
//           allowNull: true,
//         },
//         createdAt: {
//           type: DataTypes.DATE,
//           allowNull: false,
//           defaultValue: DataTypes.NOW,
//         },
//         updatedAt: {
//           type: DataTypes.DATE,
//           allowNull: false,
//           defaultValue: DataTypes.NOW,
//         },
//       },
//       {
//         sequelize,
//         modelName: "UserCompany",
//         tableName: "userCompany",
//         timestamps: true,
//         indexes: [
//           {
//             unique: true,
//             fields: ["userId", "companyId"],
//             name: "unique_user_company",
//           },
//         ],
//       }
//     );

//     return UserCompany;
//   }
// }


// src/routes/api-webapp/company/user-company-model.ts
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { User } from "../../../routes/api-webapp/authentication/user/user-model";
import { Company } from "../../../routes/api-webapp/company/company-model";

export class UserCompany extends Model<
  InferAttributes<UserCompany>,
  InferCreationAttributes<UserCompany>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare companyId: number;
  declare role: "admin" | "manager" | "employee" | "viewer";
  declare isOwner: boolean;
  declare status: "active" | "inactive";
  declare joinedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof UserCompany {
    UserCompany.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          unique: true,
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: User,
            key: "id",
          },
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: Company,
            key: "id",
          },
        },
        role: {
          type: DataTypes.ENUM("admin", "manager", "employee", "viewer"),
          allowNull: false,
          defaultValue: "employee",
        },
        isOwner: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: DataTypes.ENUM("active", "inactive"),
          allowNull: false,
          defaultValue: "active",
        },
        joinedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: "user_company",
        tableName: "user_company",
        timestamps: true,
      }
    );

    return UserCompany;
  }
}

export const initUserCompanyModel = (sequelize: Sequelize) =>
  UserCompany.initModel(sequelize);
