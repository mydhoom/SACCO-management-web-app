const app = require("./app");
const PORT = process.env.PORT || 5000;
const interestRoutes = require('./routes/interestRoutes');

app.use('/api/interest', interestRoutes);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});