import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Company } from "../company/company-model";

export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string | null;
  declare scope: "platform" | "company";
  declare companyId: string | null;
  declare baseRoleId: string | null; // Points to the default role this role extends from
  declare level: number | null; // Hierarchy level within role group (1=highest, 4=lowest)
  declare isSystemRole: boolean;
  declare priority: number; // Lower = higher authority (SuperAdmin=0, CompanyAdmin=10, Manager=20, Employee=30)
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Role {
    Role.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        scope: {
          type: DataTypes.ENUM("platform", "company"),
          allowNull: false,
        },
        companyId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: Company,
            key: "id",
          },
        },
        baseRoleId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: Role,
            key: "id",
          },
          comment: "Points to the default role this custom role extends from (NULL for base roles)",
        },
        level: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Hierarchy level within role group (1=Top-Level, 2=Middle, 3=First-Line, 4=Team Leader/Senior, etc.)",
        },
        isSystemRole: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        priority: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 50, // Default to lowest priority
          comment: "Lower value = higher authority. SuperAdmin=0, CompanyAdmin=10, Manager=20, Employee=30",
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        isDeleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
        modelName: "Role",
        tableName: "role",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["name", "scope", "companyId"],
            name: "unique_role_name_per_scope_company",
          },
          {
            // RBAC hot path index for fast role lookups
            fields: ["scope", "companyId", "isActive", "isDeleted"],
            name: "idx_roles_scope_company_active",
          },
        ],
        validate: {
          scopeCompanyIdConsistency() {
            if (this.scope === "platform" && this.companyId !== null) {
              throw new Error("Platform roles cannot have a companyId");
            }
            if (this.scope === "company" && this.companyId === null) {
              throw new Error("Company roles must have a companyId");
            }
          },
          systemRoleScopeConsistency() {
            // System roles can only be platform-scoped
            if (this.isSystemRole && this.scope !== "platform") {
              throw new Error("System roles must have scope='platform'");
            }
          },
        },
      }
    );

    return Role;
  }
}

export const initRoleModel = (sequelize: Sequelize) => Role.initModel(sequelize);
