// routes/communicationRoutes.js
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/communicationController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

// All routes require auth
router.use(authenticate);

// Badge count (any authenticated user)
router.get("/unread-count", ctrl.getUnreadCount);

// Thread list (member = own, admin/executive = all)
router.get("/threads", ctrl.getThreads);

// Create new thread (member)
router.post("/threads", ctrl.createThread);

// Single thread with messages
router.get("/threads/:ticketId", ctrl.getThreadById);

// Reply to a thread
router.post("/threads/:ticketId/reply", ctrl.replyToThread);

// Change status (admin/executive only)
router.put("/threads/:ticketId/status", authorize(["admin","executive"]), ctrl.updateStatus);

module.exports = router;
