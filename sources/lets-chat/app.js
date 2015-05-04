//
// Let's Chat
//

'use strict';

process.title = "letschat";

var _ = require('lodash'),
    fs = require('fs'),
    colors = require('colors'),
    express = require('express.oi'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    compression = require('compression'),
    helmet = require('helmet'),
    http = require('http'),
    nunjucks = require('nunjucks'),
    mongoose = require('mongoose'),
    migroose = require('./migroose'),
    MongoStore = require('connect-mongo')(express.session),
    all = require('require-tree');

var psjon = require('./package.json'),
    settings = require('./app/config'),
    httpEnabled = settings.http && settings.http.enable,
    httpsEnabled = settings.https && settings.https.enable;

var auth = require('./app/auth/index'),
    models = all('./app/models'),
    middlewares = all('./app/middlewares'),
    controllers = all('./app/controllers'),
    core = require('./app/core/index'),
    app;

//
// express.oi Setup
//
if (httpsEnabled) {
     app = express().https({
        key: fs.readFileSync(settings.https.key),
        cert: fs.readFileSync(settings.https.cert)
    }).io();
} else {
    app = express().http().io();
}

if (settings.env === 'production') {
    app.set('env', settings.env);
    app.set('json spaces', undefined);
    app.enable('view cache');
}

// Session
var sessionStore = new MongoStore({
    url: settings.database.uri,
    autoReconnect: true
});

// Session
var session = {
    key: 'connect.sid',
    secret: settings.secrets.cookie,
    store: sessionStore,
    cookie: { secure: httpsEnabled },
    resave: false,
    saveUninitialized: true
};

// Set compression before any routes
app.use(compression({ threshold: 512 }));

app.use(cookieParser());
app.io.session(session);

auth.setup(app, session, core);

// Security protections
app.use(helmet.crossdomain());
app.use(helmet.frameguard());
app.use(helmet.hidePoweredBy());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(helmet.hsts({
    maxAge: 31536000,
    includeSubdomains: true,
    force: httpsEnabled,
    preload: true
}));
app.use(helmet.contentSecurityPolicy({
    defaultSrc: ['\'none\''],
    connectSrc: ['*'],
    scriptSrc: ['\'self\'', '\'unsafe-eval\''],
    styleSrc: ['\'self\'', 'fonts.googleapis.com', '\'unsafe-inline\''],
    fontSrc: ['\'self\'', 'fonts.gstatic.com'],
    mediaSrc: ['\'self\''],
    objectSrc: ['\'self\''],
    imgSrc: ['*']
}));

var bundles = {};
app.use(require('connect-assets')({
    paths: [
        'media/js',
        'media/less',
        // 'media/img',
        // 'media/font',
    ],
    helperContext: bundles,
    build: settings.env === 'production',
    fingerprinting: settings.env === 'production',
    servePath: 'media/dist'
}));

// Public
app.use('/media', express.static(__dirname + '/media', {
    maxAge: '364d',
}));

// Templates
var nun = nunjucks.configure('templates', {
        autoescape: true,
        express: app,
        tags: {
            blockStart: '<%',
            blockEnd: '%>',
            variableStart: '<$',
            variableEnd: '$>',
            commentStart: '<#',
            commentEnd: '#>'
        }
    });

function wrapBundler(func) {
    // This method ensures all assets paths start with "./"
    // Making them relative, and not absolute
    return function() {
        return func.apply(func, arguments)
                   .replace(/href="\//g, 'href="./')
                   .replace(/src="\//g, 'src="./');
    };
}

nun.addFilter('js', wrapBundler(bundles.js));
nun.addFilter('css', wrapBundler(bundles.css));
nun.addGlobal('text_search', false);

// HTTP Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// IE header
app.use(function(req, res, next) {
    res.setHeader('X-UA-Compatible', 'IE=Edge,chrome=1');
    next();
});

//
// Controllers
//
_.each(controllers, function(controller) {
    controller.apply({
        app: app,
        core: core,
        settings: settings,
        middlewares: middlewares,
        models: models,
        controllers: controllers
    });
});

//
// Mongo
//

mongoose.connection.on('error', function (err) {
    throw new Error(err);
});

mongoose.connection.on('disconnected', function() {
    throw new Error('Could not connect to database');
});

//
// Go Time
//

function startApp() {
    var port = httpsEnabled && settings.https.port ||
               httpEnabled && settings.http.port;

    var host = httpsEnabled && settings.https.host ||
               httpEnabled && settings.http.host || '0.0.0.0';



    if (httpsEnabled && httpEnabled) {
        // Create an HTTP -> HTTPS redirect server
        var redirectServer = express();
        redirectServer.get('*', function(req, res) {
            var urlPort = port === 80 ? '' : ':' + port;
            res.redirect('https://' + req.hostname + urlPort + req.path);
        });
        http.createServer(redirectServer)
            .listen(settings.http.port || 5000, host);
    }

    app.listen(port, host);

    //
    // XMPP
    //
    if (settings.xmpp.enable) {
        var xmpp = require('./app/xmpp/index');
        xmpp(core);
    }

    var art = fs.readFileSync('./app/misc/art.txt', 'utf8');
    console.log('\n' + art + '\n\n' + 'Release ' + psjon.version.yellow + '\n');
}

function checkForMongoTextSearch() {
    var admin = new mongoose.mongo.Admin(mongoose.connection.db);
    admin.buildInfo(function (err, info) {
        if (err || !info) {
            return;
        }

        var version = info.version.split('.');
        if (version.length < 2) {
            return;
        }

        if(version[0] < 2) {
            return;
        }

        if(version[0] === '2' && version[1] < 6) {
            return;
        }

        nun.addGlobal('text_search', true);
    });
}

mongoose.connect(settings.database.uri, function(err) {
    if (err) {
        throw err;
    }

    checkForMongoTextSearch();

    migroose.needsMigration(function(migrationRequired) {
        if (migrationRequired) {
            console.log('Database migration required'.red);
            console.log('Ensure you backup your database first.');
            console.log('');
            console.log(
                'Run the following command: ' + 'npm run migrate'.yellow
            );

            return process.exit();
        }

        startApp();
    });
});
