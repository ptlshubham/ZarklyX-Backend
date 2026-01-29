import { PayrollTransaction } from "./payroll-transactions-model";
import { Employee } from "../../agency/employee/employee-model";
import { User } from "../../authentication/user/user-model";
import { Op, Transaction } from "sequelize";
const { MakeQuery } = require("../../../../services/model-service");
import path from "path";
import fs from "fs/promises";
import ExcelJS from "exceljs";


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
        isDeleted: false,
        isActive:true
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
    
    return PayrollTransaction.update({ isDeleted: true,isActive:false }, options);
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
            isDeleted: false,
            isActive:true
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

//create excel with employee id
export const createExcelForPayroll = async (companyId: string) => {
  const employees = await Employee.findAll({
    where: { companyId, isDeleted: false, isActive: true },
    include: [{
      model: User,
      as: "user",
      attributes: ["firstName", "lastName"],
      required: false,
    }],
    attributes: ["id", "basicSalary"],
  });

  if (!employees.length) {
    throw new Error("No active employees found");
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payroll");

  sheet.columns = [
    { header: "Employee UUID (AUTO)", key: "employeeId", width: 38 },
    { header: "Employee Name", key: "employeeName", width: 40 },

    { header: "Salary Month (YYYY-MM)", key: "salaryMonth", width: 20 },
    { header: "Value Date", key: "valueDate", width: 18 },

    { header: "Total Working Days", key: "totalWorkingDays", width: 20 },

    { header: "Extra Days", key: "extraDays", width: 15 },
    { header: "Extra Day Amount", key: "extraDayAmount", width: 18 },

    { header: "Extra Hours", key: "extraHours", width: 15 },
    { header: "Extra Hour Amount", key: "extraHourAmount", width: 18 },

    { header: "Half Leave Count", key: "halfLeaveCount", width: 18 },
    { header: "Half Leave Amount", key: "halfLeaveAmount", width: 18 },

    { header: "Full Leave Count", key: "fullLeaveCount", width: 18 },
    { header: "Full Leave Amount", key: "fullLeaveAmount", width: 18 },

    { header: "Late Count", key: "lateCount", width: 15 },
    { header: "Late Charge Amount", key: "lateChargeAmount", width: 20 },

    { header: "Basic Salary", key: "basicSalary", width: 18 },
    { header: "Bonus", key: "bonus", width: 15 },
    { header: "Incentive", key: "incentive", width: 15 },
    { header: "Other Allowance", key: "otherAllowance", width: 18 },

    { header: "Gross Salary (AUTO)", key: "grossSalary", width: 18 },

    { header: "PF Amount", key: "providentFundAmount", width: 18 },
    { header: "Uniform Charge", key: "uniformCharge", width: 18 },
    { header: "Advance Deduction", key: "advanceDeduction", width: 20 },
    { header: "Other Deduction Amount", key: "otherDeductionAmount", width: 22 },

    { header: "Total Deduction (AUTO)", key: "totalDeduction", width: 18 },
    { header: "Net Pay (AUTO)", key: "netPay", width: 18 },

    { header: "Status", key: "status", width: 14 },
  ];

  employees.forEach((emp: any) => {
    const row = sheet.addRow({
      employeeId: emp.id,
      employeeName: emp.user
        ? `${emp.user.firstName} ${emp.user.lastName}`
        : "",
      salaryMonth: "",
      valueDate: new Date(),
      totalWorkingDays: 0,

      basicSalary: emp.basicSalary || 0,
      bonus: 0,
      incentive: 0,
      otherAllowance: 0,

      providentFundAmount: 0,
      uniformCharge: 0,
      advanceDeduction: 0,
      otherDeductionAmount: 0,

      status: "pending",
    });

    const r = row.number;

    // ✔ FORMULAS (COLUMN LETTERS VERIFIED)
    row.getCell(19).value = { formula: `O${r}+P${r}+Q${r}+R${r}` }; // Gross
    row.getCell(24).value = { formula: `T${r}+U${r}+V${r}+W${r}` }; // Total Deduction
    row.getCell(25).value = { formula: `S${r}-X${r}` };           // Net Pay
  });


  sheet.getColumn("status").eachCell((cell, row) => {
    if (row > 1) {
      cell.dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"pending,approved,paid"'],
      };
    }
  });

 
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};




//bulk insert from excel
const getNumber = (cell: ExcelJS.Cell): number => {
  const v: any = cell.value;

  if (v === null || v === undefined || v === "") return 0;

  // Formula cell → use calculated result
  if (typeof v === "object" && "result" in v) {
    return Number(v.result) || 0;
  }

  return Number(v) || 0;
};

/* ===============================
   BULK PAYROLL INSERT
================================ */
export const bulkPayrollInsertUsingExcel = async (
  companyId: string,
  filePath: string,
  t?: Transaction
) => {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(filePath);

    const sheet = workbook.getWorksheet("Payroll");
    if (!sheet) {
      throw new Error("Payroll sheet not found in Excel");
    }

    const payrollRows: any[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Header

      /*
        COLUMN INDEX MAP
        1  employeeId
        2  employeeName (ignore)
        3  salaryMonth
        4  valueDate
        5  totalWorkingDays
        6  extraDays
        7  extraDayAmount
        8  extraHours
        9  extraHourAmount
        10 halfLeaveCount
        11 halfLeaveAmount
        12 fullLeaveCount
        13 fullLeaveAmount
        14 lateCount
        15 lateChargeAmount
        16 basicSalary
        17 bonus
        18 incentive
        19 otherAllowance
        20 grossSalary (formula → ignore)
        21 pf
        22 uniform
        23 advance
        24 otherDeduction
        25 totalDeduction (formula → ignore)
        26 netPay (formula → ignore)
        27 status
      */

      const employeeId = row.getCell(1).value as string | null;
      const salaryMonth = row.getCell(3).value as string | null;

      // Skip empty rows
      if (!employeeId && !salaryMonth) return;

      if (!employeeId) {
        throw new Error(`Employee ID missing at row ${rowNumber}`);
      }

      if (!salaryMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(salaryMonth)) {
        throw new Error(
          `Invalid Salary Month at row ${rowNumber} (Expected YYYY-MM)`
        );
      }

      /* ===============================
         SAFE PAYROLL CALCULATIONS
      =============================== */

      const basicSalary = getNumber(row.getCell(16));
      const bonus = getNumber(row.getCell(17));
      const incentive = getNumber(row.getCell(18));
      const otherAllowance = getNumber(row.getCell(19));

      const grossSalary =
        basicSalary + bonus + incentive + otherAllowance;

      const providentFundAmount = getNumber(row.getCell(21));
      const uniformCharge = getNumber(row.getCell(22));
      const advanceDeduction = getNumber(row.getCell(23));
      const otherDeductionAmount = getNumber(row.getCell(24));

      const totalDeduction =
        providentFundAmount +
        uniformCharge +
        advanceDeduction +
        otherDeductionAmount;

      const netPay = grossSalary - totalDeduction;

      if (netPay < 0) {
        throw new Error(`Net Pay cannot be negative at row ${rowNumber}`);
      }

      /* ===============================
         PUSH CLEAN DB RECORD
      =============================== */

      payrollRows.push({
        companyId,
        employeeId,
        salaryMonth,
        valueDate: row.getCell(4).value || new Date(),

        totalWorkingDays: getNumber(row.getCell(5)),

        extraDays: getNumber(row.getCell(6)),
        extraDayAmount: getNumber(row.getCell(7)),

        extraHours: getNumber(row.getCell(8)),
        extraHourAmount: getNumber(row.getCell(9)),

        halfLeaveCount: getNumber(row.getCell(10)),
        halfLeaveAmount: getNumber(row.getCell(11)),

        fullLeaveCount: getNumber(row.getCell(12)),
        fullLeaveAmount: getNumber(row.getCell(13)),

        lateCount: getNumber(row.getCell(14)),
        lateChargeAmount: getNumber(row.getCell(15)),

        basicSalary,
        bonus,
        incentive,
        otherAllowance,

        grossSalary,

        providentFundAmount,
        uniformCharge,
        advanceDeduction,
        otherDeductionAmount,
        otherDeductionReason: null,

        totalDeduction,
        netPay,

        status: row.getCell(27).value || "pending",
        isDeleted: false,
      });
    });

    /* ===============================
       DUPLICATE CHECK
    =============================== */
    for (const record of payrollRows) {
      const exists = await PayrollTransaction.findOne({
        where: {
          companyId,
          employeeId: record.employeeId,
          salaryMonth: record.salaryMonth,
          isDeleted: false,
        },
        transaction: t,
      });

      if (exists) {
        throw new Error(
          `Payroll already exists for employee ${record.employeeId} (${record.salaryMonth})`
        );
      }
    }

    /* ===============================
       BULK INSERT
    =============================== */
    return await PayrollTransaction.bulkCreate(payrollRows, {
      transaction: t,
    });

  } finally {
    // Always cleanup uploaded file
    await fs.unlink(filePath).catch(() => {});
  }
};