import express from "express";
import asyncHandler from "express-async-handler";
import dbInstance from "../../../db/core/control-db";
import { serverError } from "../../../utils/responseHandler";
import {
  createTodo,
  getTodosByDateRange,
  getTodoById,
  updateTodo,
  deleteTodo,
} from "./todo-handler";
import {authMiddleware} from "../../../../src/middleware/auth.middleware";
import { systemLog } from "../../../../src/middleware/system-log.middleware";

const router = express.Router();

// create todo

router.post(
  "/addTodo",
  authMiddleware,
  systemLog({
      module: "Todo",
      operation: "Create",
      action: "Created a new todo",
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const { title, description, category, todoDate } = req.body;
      const user = (req as any).user;

      if(!user || !user.id){
        await t.rollback();
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!title || !todoDate) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "title and todoDate are required",
        });
        return;
      }

      const data = await createTodo(
        user.id,
        user.companyId ?? null,
        { title, description, category, todoDate },
        t
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Todo created successfully",
        data,
      });
    } catch (error) {
      await t.rollback();
      //console.error("Create Todo Error:", error);
      serverError(res, "Something went wrong during todo creation.");
    }
  })
);
 
// get todos (month view)

router.get(
  "/getTodos",
  authMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const user = (req as any).user;
      const { from, to } = req.query;

      if (!from || !to) {
        res.status(400).json({
          success: false,
          message: "from and to dates are required",
        });
        return;
      }

      const data = await getTodosByDateRange(
        user.id,
        user.companyId ?? null,
        String(from),
        String(to)
      );

      res.status(200).json({
        success: true,
        message: "Todos retrieved successfully",
        data,
      });
    } catch (error) {
      //console.error("Get Todos Error:", error);
      serverError(res, "Something went wrong during fetching todos.");
    }
  })
);

// update todo by id

router.post(
  "/updateTodoById",
  authMiddleware,
  systemLog({
      module: "Todo",
      operation: "Update",
      action: "Updated a todo",
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const user = (req as any).user;
      const { id, title, description, category, todoDate, isCompleted } =
        req.body;

      if (!id) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Todo id is required",
        });
        return;
      }

      const existing = await getTodoById(
        id,
        user.id,
        user.companyId ?? null
      );

      if (!existing) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Todo not found",
        });
        return;
      }

      const data = await updateTodo(
        id,
        user.id,
        user.companyId ?? null,
        { title, description, category, todoDate, isCompleted },
        t
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Todo updated successfully",
        data,
      });
    } catch (error) {
      await t.rollback();
      //console.error("Update Todo Error:", error);
      serverError(res, "Something went wrong during todo update.");
    }
  })
);

// delete todo by id

router.get(
  "/removeTodoById/:id",
  authMiddleware,
  systemLog({
      module: "Todo",
      operation: "Delete",
      action: "Deleted a todo",
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const user = (req as any).user;
      let { id } = req.params;
      if(Array.isArray(id)){id=id[0];}
      

      if (!id) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Todo id is required",
        });
        return;
      }

      const existing = await getTodoById(
        id,
        user.id,
        user.companyId ?? null
      );

      if (!existing) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Todo not found",
        });
        return;
      }

      await deleteTodo(id, user.id, user.companyId ?? null, t);

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Todo deleted successfully",
      });
    } catch (error) {
      await t.rollback();
      //console.error("Delete Todo Error:", error);
      serverError(res, "Something went wrong during todo delete.");
    }
  })
);

export default router;
