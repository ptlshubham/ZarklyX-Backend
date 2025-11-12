// import { Employee } from "../employee/employee-model";
import bcrypt from "bcryptjs";
import { Employee } from "../../../routes/api-webapp/employee/employee-model";
import { Op } from "sequelize";
const { MakeQuery } = require("../../../services/model-service");

console.log(Employee, "Helloooooooo");

// Add a new employee
export const addEmployee = async (body: any, t: any) => {
  return await Employee.create(body, { transaction: t });
};

export const getEmployeebyID = (params: any) => {
  return Employee.findOne({
    where: {
      id: params.id,
    },
    raw: true,
  });
};

export const getAllEmployees = async () => {
  return await Employee.findAll({
    where: {
      isactive: true,
    },
    raw: true,
  });
};
// Delete employee
export const deleteEmployee = async (id: number, t: any) => {
  return await Employee.update({ isactive: false }, { where: { id }, transaction: t });
};



// Update employee details
export const updateEmployee = async (id: number, body: any, t: any) => {
  return await Employee.update(body, { where: { id }, transaction: t });
};

export const updateTheme = async (id: number, body: any, t: any) => {
  return await Employee.update(body, { where: { id }, transaction: t });
};

export const loginEmployeeByEmail = async (email: string, password: string) => {
  const employee = await Employee.findOne({
    where: { email },
    // raw: true,
  });

  if (!employee) return null;

  const isMatch = await bcrypt.compare(password, employee.password);

  return isMatch ? employee : null;
};

export const getEmployeeByEmail = async (email: string) => {
  return await Employee.findOne({
    where: { email },
    raw: false, // need full model to use .get()
  });
};


export const checkEmployeeActive = async (email: string) => {
  const user = await Employee.findOne({
    where: {
      email,
      // isActive: true, // or whatever your column is
    },
  });
  return !!user;
};






