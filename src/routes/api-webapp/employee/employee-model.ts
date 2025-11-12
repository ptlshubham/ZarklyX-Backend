import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { hashPassword } from "../../../services/password-service";
export class Employee extends Model<
    InferAttributes<Employee>,
    InferCreationAttributes<Employee>
> {
    declare id: CreationOptional<number>;
    declare name: string;
    declare email: string;
    declare password: string;
    declare contact: string;
    declare gender: string;
    declare country: string;
    declare state: string;
    declare city: string;
    declare pincode: string;
    declare address: string;
    declare aadharnumber: string;
    declare birthdate: Date;
    declare joiningdate: Date;
    declare role: string;
    declare profile_image: string | null;
    declare isactive: boolean;
    declare isthemedark: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
    

    static initModel(sequelize: Sequelize): typeof Employee {
        Employee.init(
            {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false,
                },
                name: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                email: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    unique: false,
                },
                password: {
                    type: DataTypes.STRING(255),
                    set(this: Employee, value: string) {
                        if (!value) return;
                        let hash = null;
                        hash = hashPassword(value);
                        this.setDataValue("password", hash);
                    },
                    allowNull: true,
                },
                contact: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                gender: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                },
                country: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                state: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                city: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                pincode: {
                    type: DataTypes.STRING(6),
                    allowNull: false,
                },
                address: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                },
                aadharnumber: {
                    type: DataTypes.STRING(12),
                    allowNull: false,
                },
                birthdate: {
                    type: DataTypes.DATEONLY,
                    allowNull: false,
                },
                joiningdate: {
                    type: DataTypes.DATEONLY,
                    allowNull: false,
                },
                role: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                profile_image: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                isactive: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true,
                },
                isthemedark: {
                    type: DataTypes.BOOLEAN,
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
                tableName: "employee",
                freezeTableName: true,
                timestamps: true,
            }
        );

        return Employee;
    }
}

export const initEmployeeModel = (sequelize: Sequelize) =>
    Employee.initModel(sequelize);




