const mongoose = require('mongoose');
const tweetSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true,
    },
    path: {
type: String
    }
});

tweetSchema.pre("save", function (next) {

    if (!this.created_at) this.created_at = new Date();

    next();
});




module.exports = mongoose.model('Tweet', tweetSchema);