var crypto = require('crypto');
var util = require('util');

module.exports = function(config, redis, logger) {
  var index_helpers = require('./helpers.js')(config, redis);

  return {
    requireAuth: function (req, res, next) {
      if (!req.headers.authorization) {
        res.send(401, 'authorization required');
        return next();
      }

      if (!req.params.namespace)
        req.params.namespace = 'library';

      var auth = req.headers.authorization.split(' ');

      logger.debug({headers: req.headers, url: req.url});

      if (auth[0] == 'Basic') {
        var buff  = new Buffer(auth[1], 'base64');
        var plain = buff.toString();
        var creds = plain.split(':');
        var username  = creds[0];
        var password  = creds[1];

        var shasum = crypto.createHash('sha1');
        shasum.update(password);
        var sha1pwd = shasum.digest('hex');

        redis.get(redis.key('users', username), function(err, user) {
          if (err && err.status != '404') {
            logger.error({err: err, user: user});
            res.send(500, err);
            return next();
          }

          if ((err && err.status == '404') || user == null) {
            logger.debug({permission: req.permission, user: username, statusCode: 403, message: 'access denied: user not found'});
            res.send(403, 'access denied (1)')
            return next();
          }

          // If the account is disabled, do not let it do anything at all
          if (user.disabled == true || user.disabled == "true") {
            logger.debug({message: "account is disabled", user: user.username});
            res.send(401, {message: "access denied (2)"})
            return next();
          }

          // Check that passwords match
          if (user.password == sha1pwd) {
            // TODO: Better handling for non repo images urls
            if (req.url == '/v1/users/') {
              return next();
            }

            var repo = req.params.namespace + '/' + req.params.repo;

            req.username = user.username;
            req.namespace = req.params.namespace;
            req.repo = repo;

            // Check for repo permissions
            req.permission = user.permissions[req.namespace] || user.permissions[req.repo] || 'none';

            if (req.permission == "none") {
              logger.debug({req: req, permission: req.permission, statusCode: 403, message: 'access denied: permission not set'});
              res.send(403, 'access denied');
              return next();
            }

            if (req.method == 'GET' && req.permission != "read" && req.permission != "readwrite" && req.permission != "admin") {
              logger.debug({req: req, permission: req.permission, statusCode: 403, message: 'access denied: GET requested'});
              res.send(403, "access denied");
              return next();
            }
      
            if (req.method == "PUT" && req.permission != "write" && req.permission != "readwrite" && req.permission != "admin") {
              logger.debug({req: req, permission: req.permission, statusCode: 403, message: 'access denied: PUT requested'});
              res.send(403, "access denied");
              return next();
            }
      
            if (req.method == "DELETE" && req.permission != "delete" && req.permission != "admin") {
              logger.debug({req: req, permission: req.permission, statusCode: 403, message: 'access denied: DELETE requested'});
              res.send(403, "access denied");
              return next();
            }

            var access = "none";
            switch (req.method) {
              case "GET":
                access = "read";
                break;
              case "PUT":
                access = "write";
                break;
              case "DELETE":
                access = "delete";
                break;
            }

            req.authed = true;

            index_helpers.generateToken(repo, access, function(err, token) {
              var repo = req.params.namespace + '/' + req.params.repo;

              req.token_auth = {token: token, repo: repo, access: access};

              var token = 'signature=' + token + ', repository="' + repo + '", access=' + access;

              logger.debug({namespace: req.params.namespace, repo: req.params.repo, token: token, access: access});

              res.setHeader('WWW-Authenticate', 'Token ' + token);
              res.setHeader('X-Docker-Token', token)
              res.setHeader('X-Docker-Endpoints', config.registries);

              return next();          
            })
          }
          else {
            logger.debug({statusCode: 401, message: 'access denied: valid authorization information is required'});
            res.send(401, 'Authorization required');
            return next();
          }
        });
      }
      else if (auth[0] == 'Token') {
        var rePattern = new RegExp(/(\w+)[:=][\s"]?([^",]+)"?/g);
        var matches = req.headers.authorization.match(rePattern);

        var sig    = matches[0].split('=')[1];
        var repo   = matches[1].split('=')[1].replace(/\"/g, '');
        var access = matches[2].split('=')[1];

        req.token_auth = { token: sig, repo: repo, access: access };

        logger.debug(req.token_auth, 'token auth');

        redis.get(redis.key('tokens', sig), function(err, token) {
          if (err && err.status != '404') {
            logger.error({err: err, token: sig});
            res.send(500, err);
            return next();
          }

          if (err && err.status == '404') {
            token = {};
          }

          if (token.repo == repo && token.access == access) {
            return next();
          }
          else {
            res.send(401, 'Authorization required');
            return next(false);
          }
        });
      }
    },

  }; // end return
}; // end module.exports
