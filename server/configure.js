const passport = require('passport');

const path = require('path'),
    routes = require('./routes'),
    express = require('express'),
    bodyParser = require('body-parser')
session = require('express-session');

module.exports = (app) => {
    app.use(bodyParser.urlencoded({ 'extended': true }));
    app.use(bodyParser.json());
    routes(app);//moving the routes to routes folder.
    
    app.use(passport.initialize());
app.use(passport.session());
    app.use('/public/', express.static(path.join(__dirname,
        '../public')));
    app.use(session({
        secret: 'work hard',
        resave: false,
        saveUninitialized: false
    }));

    app.set('views', path.join(__dirname, '../views'));
    app.set('view engine', 'pug');
    routes(app);
    return app;
}; 