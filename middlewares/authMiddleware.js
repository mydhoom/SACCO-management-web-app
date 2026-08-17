const jwt = require("jsonwebtoken");
require("dotenv").config();

exports.authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Access Denied! No authorization header provided." });
  }

  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : authHeader.trim();

  if (!rawToken || rawToken === "null" || rawToken === "undefined") {
    return res.status(401).json({ error: "Access Denied! Token is missing or empty." });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'sacco_super_secret_key';
    const verified = jwt.verify(rawToken, jwtSecret);
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token. Please log in again." });
  }
};

const rolePermissions = {
  admin: ["admin", "ADD_MEMBER", "UPDATE_MEMBER", "DELETE_MEMBER", "VIEW_REPORTS", "CLEARANCE_ADMIN"],
  executive: ["executive", "VIEW_REPORTS", "ADD_MEMBER"],
  member: ["member", "VIEW_SAVINGS", "REQUEST_LOAN"],
};

exports.authorize = (permissions = []) => (req, res, next) => {
  const userRole = (req.user?.role || '').toLowerCase();

  // Admin and Superadmin have full access
  if (userRole === "admin" || userRole === "superadmin") {
    return next();
  }

  const userPerms = rolePermissions[userRole] || [userRole];
  const hasPermission = permissions.some((perm) =>
    userPerms.includes(perm) || userPerms.includes(perm.toLowerCase()) || perm.toLowerCase() === userRole
  );

  if (!hasPermission) {
    return res.status(403).json({ error: "Access denied. Insufficient permissions." });
  }

  next();
};
  