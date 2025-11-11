const createError = require("http-errors");
const tokenService = require("../services/token.service");

const protect = (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return next(createError(401, "Not authorized, no token"));
  }

  const decoded = tokenService.verifyToken(token);

  if (!decoded) {
    return next(
      createError(401, "Not authorized, token is invalid or expired")
    );
  }

  // --- FINGERPRINT VERIFICATION ---
  // const currentUserAgent = req.headers["user-agent"];
  // const currentIpAddress = req.ip;

  // if (
  //   decoded.fingerprint.userAgent !== currentUserAgent ||
  //   decoded.fingerprint.ipAddress !== currentIpAddress
  // ) {
  //   return next(createError(401, "Not authorized, client mismatch"));
  // }
  // --- END FINGERPRINT VERIFICATION ---

  req.user = {
    id: decoded.sub,
    role: decoded.role,
    email: decoded.email,
  };

  next();
};

/**
 * Middleware to check if the user is an admin.
 */
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return next(createError(403, "Forbidden: This resource is for admins only."));
};

/**
 * Middleware to check if the user has the 'user' role.
 */
const isUser = (req, res, next) => {
  if (req.user && req.user.role === "user") {
    return next();
  }
  return next(createError(403, "Forbidden: This resource is for users only."));
};

module.exports = { protect, isAdmin, isUser };
