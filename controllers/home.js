const Tweet = require('../models/Tweet');
const User = require('../models/User');
const path = require('path');
const multer = require('multer');



exports.index = (req, res) => {
res.render("index")
}

exports.deposit = (req, res) => {
  res.render("deposit");
}

exports.depositmoney = (req, res) => {
  res.redirect('/depositwith');
}

exports.depositwith = (req, res) => {
  res.render('depositwith');
}

exports.mmoneypindeposit = (req, res) => {
  res.render('mmoneypindeposit')
}

exports.myaccount = (req, res) => {
  res.render('myaccount')
}

exports.loanHistory = (req, res) => {
  res.render("loanHistory")
}