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
const transactionRoutes = require("./routes/transactions");)

connectDB();
const app = express();

// 1. SECURITY & PARSING (Must be first)
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use("/api", apiLimiter);

// 2. ROUTES (The core of your app)
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/reports", reportRoutes);

// 3. ERROR HANDLING (Must be absolutely last)
app.use((req, res) => res.status(404).json({ error: "Route not found!" }));
app.use(errorHandler);

module.exports = app;
