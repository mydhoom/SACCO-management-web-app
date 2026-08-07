// routes/aiRoutes.js
// AI Financial Assistant — Secure API Routes

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const { getAiContext, handleAiChat } = require('../controllers/aiController');

// GET /api/ai/context — Returns a live data snapshot for the logged-in user (member or admin)
router.get('/context', authenticate, getAiContext);

// POST /api/ai/chat — Receives a message + context, calls Groq, returns the AI reply
router.post('/chat', authenticate, handleAiChat);

module.exports = router;
