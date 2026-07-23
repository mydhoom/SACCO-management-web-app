// debug-start.js (temporary)
console.log('DEBUG: process.cwd():', process.cwd());
console.log('DEBUG: __dirname:', __dirname);
console.log('DEBUG: NODE_PATH:', process.env.NODE_PATH || '(not set)');
console.log('DEBUG: require.resolve.paths for helmet:', require.resolve.paths && require.resolve.paths('helmet'));
try {
  console.log('DEBUG: require.resolve("helmet") ->', require.resolve('helmet'));
} catch (err) {
  console.error('DEBUG: require.resolve("helmet") failed ->', err && err.code, err && err.message);
}

const app = require("./app");
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
