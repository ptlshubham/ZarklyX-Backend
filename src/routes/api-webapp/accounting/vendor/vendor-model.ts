import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize
} from "sequelize";

export class Vendor extends Model<
    InferAttributes<Vendor>,
    InferCreationAttributes<Vendor>
> {
    declare id: CreationOptional<string>;
    declare companyId: string;
    declare companyName: string;
    declare phone: string;
    declare phoneISD: string;
    declare phoneISO: string;
    declare email: string;
    declare address: string | null;
    declare country: string | null;
    declare state: string | null;
    declare city: string | null;
    declare pinCode: string | null;
    declare gstTreatment: string | null;
    declare gstin: string | null;
    declare pan: string | null;
    declare tan: string | null;
    declare vat: string | null;
    declare website: string | null;
    declare vendorCode: string;
    declare currency: string;
    declare contactPerson: string | null;
    declare contactNo: string | null;
    declare contactNoISD: string | null;
    declare contactNoISO: string | null;
    declare contactEmail: string | null;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Vendor {
        Vendor.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                companyName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                phone: {
                    type: DataTypes.STRING(20),
                    allowNull: false,
                },
                phoneISD: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                },
                phoneISO: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                },
                email: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                address: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                country: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                state: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                city: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                pinCode: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                gstTreatment: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                gstin: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                pan: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                tan: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                vat: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                website: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                vendorCode: {
                    type: DataTypes.STRING(50),
                    allowNull: false,
                    unique: true,
                },
                currency: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                    defaultValue: 'INR',
                },
                contactPerson: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                contactNo: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                contactNoISD: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                },
                contactNoISO: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                },
                contactEmail: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
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
                tableName: "vendor",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId'],
                    },
                    {
                        fields: ['companyId', 'isActive', 'isDeleted'],
                    },
                    {
                        fields: ['vendorCode'],
                        unique: true,
                    },
                    {
                        fields: ['email'],
                    }
                ],
            }
        );
        return Vendor;
    }
}