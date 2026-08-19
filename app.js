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
const transactionRoutes = require("./routes/transactions");
const interestRoutes = require("./routes/interestRoutes");
const incentiveRoutes = require("./routes/incentiveRoutes");
const dividendRoutes = require("./routes/dividendRoutes");
const reconciliationRoutes = require("./routes/reconciliation"); // NEW: Added Reconciliation Route
const aiRoutes = require("./routes/aiRoutes"); // AI Financial Assistant
const correctionRoutes = require("./routes/correctionRoutes"); // Correction Manager
const dashboardRoutes = require("./routes/dashboardRoutes"); // Analytics Dashboard
const excelRoutes = require("./routes/excelRoutes"); // Excel Bulk Upload
const demandRoutes        = require("./routes/demandRoutes"); // Payroll Demand Batch & Clearance
const communicationRoutes = require("./routes/communicationRoutes"); // Two-way Member Communication

// Initialize Database Connection
connectDB();

// Initialize Express App
const app = express();

// ==========================================
// 1. GLOBAL CORS HEADERS (Universal Cross-Origin for Vercel & Localhost)
// ==========================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// 2. Helmet for security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
})); 
// Morgan logs incoming requests to your terminal for debugging
app.use(morgan("dev")); 
// BodyParser allows Express to read JSON data from the frontend (50MB limit for ID Card OCR images)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// Rate limiter protects your entire API from spam/brute-force attacks
app.use("/api", apiLimiter);

// ==========================================
// 2. CORE APPLICATION ROUTES
// ==========================================

// ==========================================
// 1.5 ROOT HEALTH CHECK
// ==========================================
app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Mahadev Co-operative Society API Gateway",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/transactions", transactionRoutes); 
app.use("/api/interest", interestRoutes);
app.use("/api/dividends", dividendRoutes);
app.use("/api/incentives", incentiveRoutes);
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/ai", aiRoutes); // AI Financial Assistant
app.use("/api/corrections", correctionRoutes); // Correction Manager (Reversal + Edit + Event Log)
app.use("/api/dashboard", dashboardRoutes); // Analytics Dashboard & KPIs
app.use("/api/excel", excelRoutes); // Excel Bulk Upload
app.use("/api/demand",         demandRoutes);        // Payroll Demand Batch & Clearance
app.use("/api/communication",  communicationRoutes); // Two-way Member Communication

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