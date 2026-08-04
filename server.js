const app = require("./app");
const PORT = process.env.PORT || 5000;

const loanRoutes = require('./routes/loanRoutes');
app.use("/api/loans", loanRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});