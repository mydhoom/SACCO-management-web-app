const jwt = require("jsonwebtoken");
require("dotenv").config();

exports.authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access Denied!" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid Token!" });
  }
};

exports.authorize = (permissions) => (req, res, next) => {
    const userRole = req.user.role;
    const userPermissions = rolePermissions[userRole];
  
    const hasPermission = permissions.some((perm) => userPermissions.includes(perm));
  
    if (!hasPermission) {
      return res.status(403).json({ error: "You do not have permission!" });
    }
  
    next();
  };
  
 // Example Role-Permission Mapping
const rolePermissions = {
  admin: ["ADD_MEMBER", "UPDATE_MEMBER", "DELETE_MEMBER", "VIEW_REPORTS"],
  member: ["VIEW_SAVINGS", "REQUEST_LOAN", "ADD_MEMBER"], // <-- Added ADD_MEMBER here
};
  