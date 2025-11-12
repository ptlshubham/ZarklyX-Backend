import express from "express";
import jwt from "jsonwebtoken";
import { addEmployee, getEmployeebyID, getAllEmployees, updateEmployee, deleteEmployee, loginEmployeeByEmail, updateTheme } from "./employee-handler";
import dbInstance from "../../../db/core/control-db";
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import { serverError, unauthorized, } from "../../../utils/responseHandler";
import { generateToken } from "../../../services/jwtToken-service";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import { ProfileInfoUp, DocumentUpload } from "../../../services/multer";
import { Request } from "express";
const router = express.Router();

// Add a new employee
// router.post("/register", tokenMiddleWare, async (req, res) => {
//   console.log(req.body, 'Save');
//   const t = await dbInstance.transaction();
//   try {
//     const employee = await addEmployee(req.body, t);
//     await t.commit();
//     return res.status(200).json({
//       success: true,
//       message: "Employee added successfully.",
//       data: employee,
//     });
//   } catch (error: any) {
//     await t.rollback();
//     if (
//       error.name === 'SequelizeUniqueConstraintError' &&
//       error.errors?.some((e: any) => e.path === 'email')
//     ) {
//       return res.status(409).json({
//         success: false,
//         message: 'This email is already registered.',
//         field: 'email'
//       });
//     }
//     console.error("Employees add Error:", error);
//     return serverError(res, "Something went wrong during employee registration.");
//   }
// });


//Rinkal - Registration with profile img
router.post("/register", ProfileInfoUp.single("profile_image"), async (req, res) => {
  console.log(req.body, 'Save');
  const t = await dbInstance.transaction();
  try {

    const formData = req.body;

    // if (req.file) {
    //   formData.profile_image  = req.file.filename;
    // }
if (req.file) {
  formData.profile_image = req.file.filename;
}
    const employee = await addEmployee(formData, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Employee added successfully.",
      data: employee,
    });
  } catch (error: any) {
    await t.rollback();
    if (
      error.name === 'SequelizeUniqueConstraintError' &&
      error.errors?.some((e: any) => e.path === 'email')
    ) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered.',
        field: 'email'
      });
    }
    console.error("Employees add Error:", error);
    return serverError(res, "Something went wrong during employee registration.");
  }
});

router.get("/getAll", tokenMiddleWare, async (req, res) => {
  try {
    const employees = await getAllEmployees();
    return res.status(200).json({
      success: true,
      message: "Employees retrieved successfully.",
      data: employees,
    });
  } catch (error) {
    console.error("Employees retrieved Error:", error);
    return serverError(res, "Something went wrong during employees retrieved.");
  }
});

// Delete employee
router.get("/removeById/:id", tokenMiddleWare, async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const employee = await deleteEmployee(Number(req.params.id), t);

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Employee deleted successfully.",
      data: employee,
    });
  } catch (error) {
    console.error("Employees deleted Error:", error);
    await t.rollback(); // Rollback on error
    return serverError(res, "Something went wrong during employees deleted.");
  }
});

// login endpoint
router.post('/login', async (req, res) => {
  const t = await dbInstance.transaction();

  try {
    const employee = await loginEmployeeByEmail(req.body.email, req.body.password);

    if (!employee) {
      throw new Error("Invalid Email or Password");
    }

    await t.commit();
    const payload = {
      userId: employee.id,  // Example user ID
      role: employee.role,   // Example role
    };
    const token = await generateToken(payload, "1d");
    return res.status(200).json({
      success: true,
      message: "Employee logged in successfully.",
      data: employee,
      token: token
    });

  } catch (error) {
    console.error("Employees Login Error:", error);
    await t.rollback();

    if ((error as any).message === "Invalid Email or Password") {
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    return serverError(res, "Something went wrong during employee login.");
  }
});

router.get("/getEmployeebyID/:id", tokenMiddleWare, async (req, res) => {
  try {
    let employee: any = await getEmployeebyID(req.params);
    return res.status(200).json({
      success: true,
      message: "Employees retrieved successfully.",
      data: employee,
    });
  } catch (error) {
    console.error("Employees retrieved Error:", error);
    return serverError(res, "Something went wrong during employees retrieved.");
  }
});

// Update employee
router.post("/updateById", tokenMiddleWare, async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const employee = await updateEmployee(Number(req.body.id), req.body, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Employee updated successfully.",
      data: employee,
    });
  } catch (error: any) {
    await t.rollback();
    if (
      error.name === 'SequelizeUniqueConstraintError' &&
      error.errors?.some((e: any) => e.path === 'email')
    ) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered.',
        field: 'email'
      });
    }
    console.error("Employees add Error:", error);
    return serverError(res, "Something went wrong during employee registration.");
  }
});

//Update Users Theme
router.post("/updateUserTheme", tokenMiddleWare, async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const employee = await updateTheme(Number(req.body.id), req.body, t);
    await t.commit();
    sendEncryptedResponse(res, employee, "Employee updated successfully");
  } catch (error: any) {
    await t.rollback();
    serverError(res, error);
  }
});


// module.exports = router;
export default router;






