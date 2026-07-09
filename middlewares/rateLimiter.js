// A simple bypass to satisfy the app's requirement without crashing
const rateLimiter = (req, res, next) => {
    next(); 
};

module.exports = rateLimiter;
