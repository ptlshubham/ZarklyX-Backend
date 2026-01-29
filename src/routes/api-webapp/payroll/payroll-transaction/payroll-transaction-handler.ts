import { PayrollTransaction } from "./payroll-transactions-model";
import { Employee } from "../../agency/employee/employee-model";
import { User } from "../../authentication/user/user-model";
import { Op, Transaction } from "sequelize";
const { MakeQuery } = require("../../../../services/model-service");

// Get employee data for payroll creation
export const getEmployeePayrollData = async (employeeId: string) => {
    const employee = await Employee.findOne({
        where: { id: employeeId, isDeleted: false, isActive: true },
        include: [{
            model: User,
            as: 'user',
            attributes: ['firstName', 'lastName', 'email'],
            required: false
        }],
        attributes: ['id', 'companyId', 'basicSalary', 'hra', 'allowances', 'designation','paymentMode']
    });
    
    if (!employee) return null;
    
    return {
        employeeId: employee.id,
        companyId: employee.companyId,
        basicSalary: employee.basicSalary || 0,
        hra: employee.hra || 0,
        allowances: employee.allowances || 0,
        grossSalary: (employee.basicSalary || 0) + (employee.hra || 0) + (employee.allowances || 0),
        designation: employee.designation,
        employeeName: (employee as any).user ? `${(employee as any).user.firstName} ${(employee as any).user.lastName}` : '',
        email: (employee as any).user?.email || ''
    };
};

// Create payroll transaction
export const createPayrollTransaction = async (payload: any, t?: Transaction) => {
    // Validate employee exists
    const employee = await Employee.findOne({
        where: { id: payload.employeeId, isDeleted: false, isActive: true }
    });
    
    if (!employee) {
        throw new Error(`Employee with ID ${payload.employeeId} not found or inactive`);
    }
    
    return PayrollTransaction.create(payload, { transaction: t });
};

// Get all payroll transactions with filters and pagination
export const getAllPayrollTransactions = (query: any) => {
    const { modelOption, orderBy, attributes } = MakeQuery({
        query,
        Model: PayrollTransaction,
    });

    const limit = Number(query.limit) || 10;
    const offset = Number(query.offset) || 0;

    let whereClause: any = {
        ...modelOption,
        isDeleted: false
    };

    if (query.startDate && query.endDate) {
        whereClause.valueDate = {
            [Op.between]: [new Date(query.startDate), new Date(query.endDate)]
        };
    }

    if (query.status) {
        whereClause.status = query.status;
    }

    let includeClause: any = [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'designation'],
        required: false,
        include: [{
            model: User,
            as: 'user',
            attributes: ['firstName', 'lastName', 'email'],
            required: false
        }]
    }];

    if (query.employeeName) {
        includeClause[0].include[0].where = {
            [Op.or]: [
                { firstName: { [Op.like]: `%${query.employeeName}%` } },
                { lastName: { [Op.like]: `%${query.employeeName}%` } }
            ]
        };
    }

    return PayrollTransaction.findAndCountAll({
        where: whereClause,
        include: includeClause,
        attributes: attributes || ['id', 'salaryMonth', 'valueDate', 'grossSalary', 'netPay', 'status', 'createdAt'],
        order: orderBy || [['createdAt', 'DESC']],
        limit,
        offset
    });
};

// Get payroll transaction by ID
export const getPayrollTransactionById = async (id: string) => {
    return PayrollTransaction.findOne({
        where: { id, isDeleted: false },
        include: [{
            model: Employee,
            as: 'employee',
            attributes: ['id', 'designation'],
            required: false,
            include: [{
                model: User,
                as: 'user',
                attributes: ['firstName', 'lastName', 'email'],
                required: false
            }]
        }]
    });
};

// Get payroll transactions by employee
export const getPayrollTransactionsByEmployee = async (employeeId: string, query: any = {}) => {
    const limit = Number(query.limit) || 10;
    const offset = Number(query.offset) || 0;

    let whereClause: any = {
        employeeId,
        isDeleted: false
    };

    if (query.status) {
        whereClause.status = query.status;
    }

    if (query.salaryMonth) {
        whereClause.salaryMonth = query.salaryMonth;
    }

    return PayrollTransaction.findAndCountAll({
        where: whereClause,
        order: [['salaryMonth', 'DESC']],
        limit,
        offset
    });
};

// Update payroll transaction
export const updatePayrollTransaction = async (id: string, payload: any, t?: Transaction) => {
    const options: any = { where: { id, isDeleted: false } };
    if (t) options.transaction = t;
    
    return PayrollTransaction.update(payload, options);
};

// Update payroll status
export const updatePayrollStatus = async (id: string, status: "pending" | "approved" | "paid", t?: Transaction) => {
    const options: any = { where: { id, isDeleted: false } };
    if (t) options.transaction = t;
    
    return PayrollTransaction.update({ status }, options);
};

// Soft delete payroll transaction
export const deletePayrollTransaction = async (id: string, t?: Transaction) => {
    const options: any = { where: { id } };
    if (t) options.transaction = t;
    
    return PayrollTransaction.update({ isDeleted: true }, options);
};

// Check if payroll exists for employee and month
export const checkPayrollExists = async (employeeId: string, salaryMonth: string, excludeId?: string) => {
    const where: any = {
        employeeId,
        salaryMonth,
        isDeleted: false
    };

    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }

    return PayrollTransaction.findOne({ where });
};

// Bulk update payroll status
export const bulkUpdatePayrollStatus = async (ids: string[], status: "pending" | "approved" | "paid", companyId: string, t?: Transaction) => {
    const options: any = {
        where: {
            id: { [Op.in]: ids },
            companyId,
            isDeleted: false
        }
    };
    if (t) options.transaction = t;
    
    return PayrollTransaction.update({ status }, options);
};

// Get payroll summary by company
export const getPayrollSummary = async (companyId: string, salaryMonth?: string) => {
    let whereClause: any = {
        companyId,
        isDeleted: false
    };

    if (salaryMonth) {
        whereClause.salaryMonth = salaryMonth;
    }

    return PayrollTransaction.findAll({
        where: whereClause,
        attributes: [
            'status',
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
            [require('sequelize').fn('SUM', require('sequelize').col('grossSalary')), 'totalGross'],
            [require('sequelize').fn('SUM', require('sequelize').col('netPay')), 'totalNet']
        ],
        group: ['status'],
        raw: true
    });
};