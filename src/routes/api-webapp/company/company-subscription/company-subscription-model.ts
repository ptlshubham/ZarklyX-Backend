import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Company } from "../../../api-webapp/company/company-model";
import { SubscriptionPlan } from "../../../api-webapp/superAdmin/subscription-plan/subscription-plan-model";


export class CompanySubscription extends Model<
  InferAttributes<CompanySubscription>,
  InferCreationAttributes<CompanySubscription>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare subscriptionPlanId: string;
  declare numberOfUsers: number;
  declare startDate: CreationOptional<Date>;
  declare endDate: CreationOptional<Date>;
  declare originalPrice: number; // Price before discount (base plan + addons)
  declare discountType: 'percentage' | 'fixed' | null; // Type of discount applied
  declare discountValue: number | null; // Percentage (0-100) or fixed amount
  declare discountAmount: number; // Calculated discount amount
  declare addonModuleCost: number; // Total cost of addon modules purchased
  declare addonPermissionCost: number; // Total cost of addon permissions purchased
  declare price: number; // Final price paid (originalPrice - discountAmount)
  declare status: string | null;
  declare isCurrent: boolean;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof CompanySubscription {
    CompanySubscription.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        companyId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Company,
            key: "id",
          },
        },
        subscriptionPlanId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: SubscriptionPlan,
            key: "id",
          },
        },
        numberOfUsers: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Number of user seats purchased (for per-seat pricing plans)",
        },
        startDate: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        endDate: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        originalPrice: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          comment: "Price before discount (base plan + addon modules)",
        },
        discountType: {
          type: DataTypes.ENUM("percentage", "fixed"),
          allowNull: true,
          defaultValue: null,
          comment: "Type of discount: percentage (0-100) or fixed amount",
        },
        discountValue: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null,
          comment: "Discount percentage (0-100) or fixed amount value",
        },
        discountAmount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.00,
          comment: "Calculated discount amount deducted from originalPrice",
        },
        addonModuleCost: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.00,
          comment: "Total cost of addon modules purchased with this subscription",
        },
        addonPermissionCost: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.00,
          comment: "Total cost of addon permissions purchased with this subscription",
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          comment: "Final price paid by company (originalPrice - discountAmount)",
        },
        status: {
          type: DataTypes.ENUM("active", "expired", "cancelled"),
          allowNull: true,
          defaultValue: "active",
        },
        isCurrent: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
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
        modelName: "CompanySubscription",
        tableName: "company_subscription",
        timestamps: true,
        indexes: [
          {
            fields: ["companyId", "isCurrent"],
            name: "idx_company_subscription_current",
            where: { isCurrent: true, isDeleted: false },
          },
          {
            fields: ["companyId", "status"],
            name: "idx_company_subscription_status",
          },
          {
            fields: ["subscriptionPlanId"],
            name: "idx_company_subscription_planId",
          },
          {
            fields: ["startDate", "endDate"],
            name: "idx_company_subscription_dates",
          },
        ],
        validate: {
          priceCalculation() {
            // Validate that price = (originalPrice - discountAmount) + addonModuleCost + addonPermissionCost
            const basePrice = parseFloat(this.originalPrice as any) - parseFloat(this.discountAmount as any);
            const totalAddons = parseFloat(this.addonModuleCost as any) + parseFloat(this.addonPermissionCost as any);
            const calculatedPrice = basePrice + totalAddons;
            if (Math.abs(calculatedPrice - parseFloat(this.price as any)) > 0.01) {
              throw new Error("Price must equal (originalPrice - discountAmount) + addonModuleCost + addonPermissionCost");
            }
          },
          discountValidation() {
            if (this.discountType && !this.discountValue) {
              throw new Error("discountValue is required when discountType is set");
            }
            if (
              this.discountType === 'percentage' &&
              this.discountValue !== null &&
              (Number(this.discountValue) < 0 || Number(this.discountValue) > 100)
            ) {
              throw new Error("Percentage discount must be between 0 and 100");
            }
          },
        },
      }
    );

    return CompanySubscription;
  }
}

export const initCompanySubscriptionModel = (sequelize: Sequelize) =>
  CompanySubscription.initModel(sequelize);
