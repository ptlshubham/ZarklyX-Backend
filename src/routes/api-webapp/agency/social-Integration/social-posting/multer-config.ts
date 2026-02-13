import multer from "multer";
import path from "path";

// Single multer configuration for both social posting and scheduling
export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(process.cwd(), "public/social-media-img"));
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      // Images
      "image/jpeg", 
      "image/png", 
      "image/gif", 
      "image/webp",
      // Videos
      "video/mp4",
      "video/quicktime",
      "video/mpeg",
      "video/webm",
      "video/x-msvideo",
      "video/x-ms-wmv"
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, PNG, GIF, WebP) and video files (MP4, MOV, MPEG, WebM, AVI, WMV) are allowed"));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for videos
  },
});

// Helper function to detect media type from files
export function detectMediaType(files: Express.Multer.File[]): "IMAGE" | "VIDEO" {
  if (!files || files.length === 0) {
    return "IMAGE";
  }

  const videoMimes = ["video/mp4", "video/quicktime", "video/mpeg", "video/webm", "video/x-msvideo", "video/x-ms-wmv"];
  
  const hasVideo = files.some(file => videoMimes.includes(file.mimetype));
  
  return hasVideo ? "VIDEO" : "IMAGE";
}
