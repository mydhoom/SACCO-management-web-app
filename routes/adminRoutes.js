const express = require("express");
const { authenticate, authorize } = require("../middleware/authMiddleware"); // Note: check if your folder is 'middleware' or 'middlewares'
const { purgeDatabase } = require("../controllers/adminController");

const router = express.Router();

// Admin-only Database Purge Route
router.post("/purge", authenticate, authorize(["admin"]), purgeDatabase);

module.exports = router;