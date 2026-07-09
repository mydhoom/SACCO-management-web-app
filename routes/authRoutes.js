const express = require("express");
const { 
  register, 
  login, 
  bulkUpload, 
  getAllMembers, 
  deleteMember 
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/bulk-upload", bulkUpload); 

// The new routes for the Directory!
router.get("/users", getAllMembers);
router.delete("/users/:vendorNo", deleteMember);

module.exports = router;