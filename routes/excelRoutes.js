const express = require("express");
const multer = require("multer");
const excelUploadController = require("../controllers/excelUploadController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// Configure multer for memory storage (buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Admin only route for bulk uploading historical loans
router.post(
  "/upload-historical-loans",
  authenticate,
  authorize(["admin"]),
  upload.single("file"),
  excelUploadController.uploadHistoricalLoans
);

module.exports = router;
