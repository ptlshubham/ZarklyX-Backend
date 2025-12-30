import { Request, Response, NextFunction } from "express";

// Simple role-based middleware using token payload
// Expects tokenMiddleWare to have run and placed decoded token in req.user

// export const requireRole = (roles: string | string[], subroles?: string | string[]) => {

//   const allowed = Array.isArray(roles) ? roles : [roles];
//   const allowedSub = subroles ? (Array.isArray(subroles) ? subroles : [subroles]) : undefined;
//   return (req: Request, res: Response, next: NextFunction) => {
//     const auth: any = (req as any).user;
//     console.log("➡️ requireRole called");
//     console.log("REQ.USER:", req.user);
//     if (!auth) {
//       res.status(401).json({ success: false, message: "Unauthorized" });
//       return;
//     }
//     const role = auth.role || auth.userType || null;
//     if (!role || !allowed.includes(role)) {
//       res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
//       return;
//     }
//     if (allowedSub) {
//       const sub = auth.subRole || auth.subrole || null;
//       // If user has a subrole defined, enforce it. If not defined, allow by default
//       if (sub && !allowedSub.includes(sub)) {
//         res.status(403).json({ success: false, message: "Forbidden: insufficient subrole" });
//         return;
//       }
//     }
//     next();
//   };
// };



export const requireRole = (
  roles: string | string[],
  subroles?: string | string[]
) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const allowedSub = subroles
    ? Array.isArray(subroles)
      ? subroles
      : [subroles]
    : null;

  return (req: Request, res: Response, next: NextFunction) => {
    console.log("➡️ requireRole called");
    console.log("REQ.USER:", (req as any).user);

    const auth: any = (req as any).user;

    if (!auth) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const role = auth.role;

    if (!role || !allowed.includes(role)) {
      res.status(403).json({
        success: false,
        message: "Forbidden: insufficient role",
      });
      return;
    }

    if (allowedSub) {
      const sub = auth.subRole || null;

      if (!sub || !allowedSub.includes(sub)) {
        res.status(403).json({
          success: false,
          message: "Forbidden: insufficient subrole",
        });
        return;
      }
    }

    next();
  };
};
