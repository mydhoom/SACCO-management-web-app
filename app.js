// app.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// Guarded helmet require so missing module doesn't crash the process
const helmet = (() => {
  try {
    const h = require("helmet");
    console.log("helmet loaded OK");
    return h;
  } catch (e) {
    console.error("Failed to require helmet:", e && e.code, e && e.message);
    return null;
  }
})();

const connectDB = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");
const apiLimiter = require("./middlewares/rateLimiter");

// Route Files
const authRoutes = require("./routes/authRoutes");
const memberRoutes = require("./routes/memberRoutes");
const loanRoutes = require("./routes/loanRoutes");
const savingsRoutes = require("./routes/savingsRoutes");
const reportRoutes = require("./routes/reportRoutes");

connectDB();
const app = express();

// 1. SECURITY & PARSING (Must be first)
app.use(cors());
if (helmet) {
  app.use(helmet());
} else {
  console.warn("helmet not available — continuing without helmet middleware");
}
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
