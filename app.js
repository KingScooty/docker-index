var config = require('config');
var restify = require('restify');
var bunyan = require('bunyan');
var Endpointer = require('endpointer/restify');

// Setup logger
var logger = bunyan.createLogger({
  name: 'docker-index',
  stream: process.stdout,
  level: config.loglevel,
  src: true,
  serializers: {
    req: bunyan.stdSerializers.req
  }
});

// Setup Redis Connection
var redis = require('redis').createClient(config.redis.port, config.redis.host);

redis.on('error', function(err) {
  logger.error({domain: 'redis', err: err, stack: err.stack});
});

// Setup Restify Endpoints
var endpoints = new Endpointer({
  docs: {
    title: 'Docker Index',
    enabled: true
  },
  endpoints: __dirname + '/endpoints',
  arguments: [config, redis, logger],
  version: '1.0.0'
});

// Create our Restify server
var server = restify.createServer({
  name: 'docker-index',
  version: '1.0.0'
});

// Catch unhandled exceptions and log it!
server.on('uncaughtException', function (req, res, route, err) {
  logger.error({err: err}, 'uncaughtException');
});

// Basic Restify Middleware
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());

// Important so that application/json does not override
// parameters passed via the url.
server.use(restify.bodyParser({
  mapParams: false,
  overrideParams: false
}));

// Audit logging to stdout via bunyan
server.on('after', restify.auditLogger({
  log: logger
}));

// Attach our endpoints
endpoints.attach(server);

// Listen
server.listen(config.app.port, function () {
  console.log('%s listening at %s', server.name, server.url);
});

require('./lib/firsttime.js')(config, redis);
require('./lib/upgrades.js')(config, redis);
