const express = require('express'),
    router = express.Router(),
    home = require('../controllers/home');
authController = require('../controllers/authController');
const multer = require('multer');

const upload = multer({dest: './uploads'});


module.exports = (app) => {
    router.get('/', home.index);
    router.get('/deposit', home.deposit);
    router.get('/depositwith', home.depositwith);
    router.get('/mmoneypindeposit', home.mmoneypindeposit)
    router.get('/myaccount', home.myaccount)
    router.get('/loanHistory', home.loanHistory)

    router.post('/deposit', home.depositmoney)
  
    app.use(router);
}; 