import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ManagerHandover extends Model<
    InferAttributes<ManagerHandover>,
    InferCreationAttributes<ManagerHandover>
> {
    // Primary Key
    declare id: CreationOptional<string>; // UUID

    declare managerId: string; // FK to Employee (primary manager going on leave)
    declare backupManagerId: string; // FK to Employee (backup manager)
    declare companyId: string; // FK to Company

    declare status: "Pending" | "Accepted" | "Active" | "Rejected" | "Expired" | "Completed" | "Cancelled"; // Handover status

    declare startDate: Date | null;
    declare endDate: Date | null;
    declare acceptedAt: Date | null;
    declare acceptedBy: string | null;
    declare rejectedAt: Date | null;
    declare rejectedBy: string | null;
    declare requestedBy: string | null; // userId of requester (manager or admin)
    declare approvedBy: string | null; // userId of approver (admin)

    declare notes: string | null; // Additional handover notes

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ManagerHandover {
        ManagerHandover.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                  companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "company",
                        key: "id",
                    },
                    comment: "Company context for the handover",
                },
                managerId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                    comment: "Manager going on leave",
                },
                backupManagerId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                    comment: "Backup manager taking over",
                },
                status: {
                    type: DataTypes.ENUM("Pending", "Accepted", "Active", "Rejected", "Expired", "Completed", "Cancelled"),
                    allowNull: false,
                    defaultValue: "Pending",
                    comment: "Current status of the handover",
                },
                startDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "Handover start date",
                },
                endDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "Handover end date",
                },
                acceptedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "When backup manager accepted the handover",
                },
                acceptedBy: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    comment: "User ID who accepted the handover",
                },
                rejectedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "When backup manager rejected the handover",
                },
                rejectedBy: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    comment: "User ID who rejected the handover",
                },
                requestedBy: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    comment: "User ID who requested the handover (manager or admin)",
                },
                approvedBy: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    comment: "User ID who approved/admin assigned the handover",
                },
                notes: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                    comment: "Additional handover notes or instructions",
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
                modelName: "ManagerHandover",
                tableName: "manager_handover",
                timestamps: true,
                indexes: [
                    {
                        fields: ["managerId"],
                        name: "idx_manager_handover_manager",
                    },
                    {
                        fields: ["backupManagerId"],
                        name: "idx_manager_handover_backup",
                    },
                    {
                        fields: ["companyId"],
                        name: "idx_manager_handover_company",
                    },
                    {
                        fields: ["status"],
                        name: "idx_manager_handover_status",
                    },
                    {
                        fields: ["startDate"],
                        name: "idx_manager_handover_startDate",
                    },
                    {
                        fields: ["endDate"],
                        name: "idx_manager_handover_endDate",
                    },
                ],
            }
        );

        return ManagerHandover;
    }

}

export const initManagerHandoverModel = (sequelize: Sequelize) =>
    ManagerHandover.initModel(sequelize);
