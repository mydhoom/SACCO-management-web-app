// app.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet"); 
require("dotenv").config();

const connectDB = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");
const apiLimiter = require("./middlewares/rateLimiter");

// Route Files
const authRoutes = require("./routes/authRoutes");
const memberRoutes = require("./routes/memberRoutes");
const loanRoutes = require("./routes/loanRoutes");
const savingsRoutes = require("./routes/savingsRoutes");
const reportRoutes = require("./routes/reportRoutes");

// Initialize Database Connection
connectDB();

// Initialize Express App
const app = express();

// ==========================================
// 1. SECURITY & GLOBAL MIDDLEWARES
// ==========================================
// Helmet goes first to immediately set secure HTTP headers
app.use(helmet()); 
// CORS allows your React frontend to communicate with this backend
app.use(cors()); 
// Morgan logs incoming requests to your terminal for debugging
app.use(morgan("dev")); 
// BodyParser allows Express to read JSON data from the frontend
app.use(bodyParser.json()); 
// Rate limiter protects your entire API from spam/brute-force attacks
app.use("/api", apiLimiter); 

// ==========================================
// 2. CORE APPLICATION ROUTES
// ==========================================
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/reports", reportRoutes);

// ==========================================
// 3. FALLBACK & ERROR HANDLING
// ==========================================

// Handle unmapped routes (404)
// Formatted as a JSON object so your React frontend can read the error properly
app.use((req, res, next) => {
  res.status(404).json({ 
    success: false,
    error: `Route not found: ${req.originalUrl}` 
  });
});

// Global Error Handler (Catches system crashes and custom errors)
// This must be the absolute last middleware in the file
app.use(errorHandler);

module.exports = app;