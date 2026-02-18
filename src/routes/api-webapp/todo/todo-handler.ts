import { Todo } from "./todo-model";
import { Op, Transaction } from "sequelize";

type TodoConfig = {
    title: string;
    description?: string | null;
    category?: string | null;
    todoDate: string;
};

type TodoUpdateConfig = {
    title?: string;
    description?: string | null;
    category?: string | null;
    todoDate?: string;
    isCompleted?: boolean;
};

// create todo

export const createTodo = async (
    userId: string,
    companyId: string | null,
    todoData: TodoConfig,
    t?: Transaction
) => {
    return await Todo.create(
        {
            userId,
            companyId,
            title: todoData.title,
            description: todoData.description || null,
            category: todoData.category || null,
            todoDate: todoData.todoDate,
        },
        {
            transaction: t,
        }
    );
};

// read todos

export const getTodosByDateRange = async (
    userId: string,
    companyId: string | null,
    fromDate: string,
    toDate: string
) => {
    return await Todo.findAll({
        where: {
            userId,
            companyId,
            todoDate: {
                [Op.between]: [fromDate, toDate],
            },
        },
        order: [
            ["todoDate", "ASC"],
            ["createdAt", "ASC"],
        ],
    });
};

// get todo by id

export const getTodoById = async (
    id: string,
    userId: string,
    companyId: string | null
) => {

    return await Todo.findOne({
        where: {
            id,
            userId,
            companyId
        },
    });

};

// update todo

export const updateTodo = async (
    id: string,
    userId: string,
    companyId: string | null,
    updateData: TodoUpdateConfig,
    t?: Transaction
) => {

    await Todo.update(updateData, {
        where: {
            id,
            userId,
            companyId,
        },
        transaction: t,
    });

    return await Todo.findOne({
        where: {
            id,
            userId,
            companyId,
        },
        transaction: t,
    });

}

// delete todo

export const deleteTodo = async (
    id: string,
    userId: string,
    companyId: string | null,
    t?: Transaction
) => {
    return await Todo.destroy({
        where: {
            id,
            userId,
            companyId,
        },
        transaction: t,
    });
};