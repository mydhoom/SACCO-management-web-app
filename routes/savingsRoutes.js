const express = require("express");
const { authenticate } = require("../middlewares/authMiddleware");
const { addSavings, getSavings } = require("../controllers/savingsController");

const router = express.Router();

router.post("/", authenticate, addSavings);
router.get("/", authenticate, getSavings);

module.exports = router;
