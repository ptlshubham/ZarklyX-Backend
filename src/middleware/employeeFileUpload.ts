import multer from "multer";
import fs from "fs";
import path from "path";

const EMPLOYEE_UPLOAD_PATHS: Record<string, string> = {
    profilePhoto: "public/employee/profilePic",
    resumeFile: "public/employee/resume",
    aadharDocument: "public/employee/aadhar",
    panDocument: "public/employee/pan",
};

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const uploadDir =
            EMPLOYEE_UPLOAD_PATHS[file.fieldname] ||
            "public/employee/others";

        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },

    filename(req, file, cb) {
        // const unique =
        //   Date.now() + "-" + Math.round(Math.random() * 1e9);
        // cb(null, unique + path.extname(file.originalname));

        cb(null, file.originalname);
    },
});

export const employeeFileUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
