const jwt = require("jsonwebtoken");
require("dotenv").config({ path: 'e:/Mahadev Society Frontend/sacco-backend/.env' });

const token = jwt.sign(
  { vendorNo: "99999", role: "admin", id: "123456" },
  process.env.JWT_SECRET || 'your_default_secret',
  { expiresIn: "1h" }
);

console.log(token);
