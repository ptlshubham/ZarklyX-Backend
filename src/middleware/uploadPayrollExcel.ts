
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: "uploads/payroll",
  filename: (_req, file, cb) => {
    cb(null, `payroll-upload-${Date.now()}${path.extname(file.originalname)}`);
  },
});

export const uploadPayrollExcel = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if(file.size >  3 * 1024 * 1024){
        return cb(new Error("file is to large"));
    }
    if (!file.originalname.match(/\.(xlsx|xls)$/)) {
      return cb(new Error("Only Excel files allowed"));
    }
    cb(null, true);
  },
});
