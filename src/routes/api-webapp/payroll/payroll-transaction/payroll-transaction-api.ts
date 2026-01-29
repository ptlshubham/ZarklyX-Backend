import { messages } from './../../../../validations/zod-messages';
import { Router, Request, Response } from "express";
import dbInstance from "../../../../db/core/control-db";
import { serverError, alreadyExist } from "../../../../utils/responseHandler";
import fs from 'fs';
import {
    createPayrollTransaction,
    getAllPayrollTransactions,
    updatePayrollTransaction,
    updatePayrollStatus,
    deletePayrollTransaction,
    checkPayrollExists,
    getPayrollTransactionById,
    getEmployeePayrollData,
    bulkPayrollInsertUsingExcel,
    createExcelForPayroll
} from "./payroll-transaction-handler";
import { uploadPayrollExcel } from "../../../../middleware/uploadPayrollExcel";
const router = Router();

// Get employee payroll data
router.get("/employee/:employeeId/data", async (req: Request, res: Response): Promise<void> => {
    try {
        const employeeData = await getEmployeePayrollData(req.params.employeeId);
        
        if (!employeeData) {
            res.status(404).json({ error: "Employee not found" });
            return;
        }

        res.json({
            message: "Employee payroll data retrieved successfully",
            data: employeeData
        });
    } catch (error: any) {
        serverError(res,  "Error fetching employee data");
    }
});

// Create payroll transaction
router.post("/addPayroll", async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
          if (req.body.salaryMonth || req.body.employeeId) {
            const employeeId = req.body.employeeId;
            const salaryMonth = req.body.salaryMonth ;
            
            const existingPayroll = await checkPayrollExists(employeeId, salaryMonth, req.params.id);
            if (existingPayroll) {
                await t.rollback();
                alreadyExist(res, "Payroll already exists for this employee and month");
                return;
            }
        }

        const payroll = await createPayrollTransaction(req.body, t);
        await t.commit();

        res.status(201).json({
            message: "Payroll transaction created successfully",
            data: payroll
        });
    } catch (error: any) {
        await t.rollback();
        serverError(res, "Error creating payroll transaction");
    }
});

// Get payroll transactions with companyId and filters
router.get("/getPayrollTransactionByCompanyId", async (req: Request, res: Response): Promise<void> => {
    try {
        const { companyId } = req.query;
        
        if (!companyId) {
            res.status(400).json({ error: "Company ID is required" });
            return;
        }

        const query = { ...req.query } as any;
        const result = await getAllPayrollTransactions(query);

        res.json({
            message: "Payroll transactions retrieved successfully",
            data: result.rows,
            pagination: {
                total: result.count,
                page: Math.floor((Number(req.query.offset) || 0) / (Number(req.query.limit) || 10)) + 1,
                limit: Number(req.query.limit) || 10,
                totalPages: Math.ceil(result.count / (Number(req.query.limit) || 10))
            }
        });
    } catch (error: any) {
        serverError(res, "Error fetching payroll transactions");
    }
});

// Update payroll transaction
router.put("/updatePayrollTransaction/:id", async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
        const payroll = await getPayrollTransactionById(req.params.id);
        if (!payroll) {
            await t.rollback();
            res.status(404).json({ error: "Payroll transaction not found" });
            return;
        }

        if (req.body.salaryMonth || req.body.employeeId) {
            const employeeId = req.body.employeeId || payroll.employeeId;
            const salaryMonth = req.body.salaryMonth || payroll.salaryMonth;
            
            const existingPayroll = await checkPayrollExists(employeeId, salaryMonth, req.params.id);
            if (existingPayroll) {
                await t.rollback();
                alreadyExist(res, "Payroll already exists for this employee and month");
                return;
            }
        }

        await updatePayrollTransaction(req.params.id, req.body, t);
        await t.commit();

        res.json({ message: "Payroll transaction updated successfully" });
    } catch (error: any) {
        await t.rollback();
        serverError(res, "Error updating payroll transaction");
    }
});

// Update payroll status
router.patch("/updatePayrollStatus/:id/status", async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
        const { status } = req.body;
        
        if (!status || !["pending", "approved", "paid"].includes(status)) {
            await t.rollback();
            res.status(400).json({ error: "Invalid status. Must be pending, approved, or paid" });
            return;
        }

        const payroll = await getPayrollTransactionById(req.params.id);
        if (!payroll) {
            await t.rollback();
            res.status(404).json({ error: "Payroll transaction not found" });
            return;
        }

        await updatePayrollStatus(req.params.id, status, t);
        await t.commit();

        res.json({ message: "Payroll status updated successfully" });
    } catch (error: any) {
        await t.rollback();
        serverError(res,  "Error updating payroll status");
    }
});

// soft  Delete payroll transaction
router.delete("/softDeletePayrollTransaction/:id", async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
        const payroll = await getPayrollTransactionById(req.params.id);
        if (!payroll) {
            await t.rollback();
            res.status(404).json({ error: "Payroll transaction not found" });
            return;
        }

        await deletePayrollTransaction(req.params.id, t);
        await t.commit();

        res.json({ message: "Payroll transaction deleted successfully" });
    } catch (error: any) {
        await t.rollback();
        serverError(res,  "Error deleting payroll transaction");
    }
});

router.get(
  "/createExcelForPayroll/:companyId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        res.status(400).json({ error: "Company ID is required" });
        return;
      }

      const buffer = await createExcelForPayroll(companyId);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=payroll-${companyId}.xlsx`
      );

      res.send(buffer);
    } catch (error: any) {
      console.error(error);
      serverError(res, "Error creating payroll Excel file");
    }
  }
);



router.post(
  "/bulkPayrollInsertUsingExcel/:companyId",
  uploadPayrollExcel.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        res.status(400).json({ error: "Company ID is required" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Excel file is required" });
        return;
      }

      await bulkPayrollInsertUsingExcel(companyId, req.file.path);

      res.status(201).json({
        message: "Payroll inserted successfully using Excel",
      });

    } catch (error: any) {
      console.error(error);
      serverError(res, error.messages || "Error inserting payroll using Excel");
    }
  }
);
export default router;