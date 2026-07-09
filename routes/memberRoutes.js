const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const {
  addMember,
  getMembers,
  getMember,
  updateMember,
  deleteMember,
} = require("../controllers/memberController");

const router = express.Router();

router.post("/", authenticate, authorize(["admin"]), addMember);
router.get("/", authenticate, getMembers);
router.get("/:id", authenticate, getMember);
router.put("/:id", authenticate, authorize(["admin"]), updateMember);
router.delete("/:id", authenticate, authorize(["admin"]), deleteMember);

module.exports = router;
