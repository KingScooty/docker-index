var _ = require('underscore');
var crypto = require('crypto');
var restify = require('restify');

module.exports = function(redis, logger) {

  var endpoints = {};

  endpoints.listUsers = function(req, res, next) {
    redis.smembers('users', function(err, members) {
      res.send(200, members);
      return next();
    });
  };

  endpoints.getUser = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, user) {
      if (err) {
        res.send(500, {message: error, error: true});
        return next();
      }

      if (user == null) {
        res.send(404, {message: 'invalid user', error: false});
        return next();
      }

      var user_object = JSON.parse(user);

      delete user_object.password;

      res.send(200, user_object);
      return next();
    })
  };

  endpoints.getUserPermissions = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, user) {
      if (err) {
        res.send(500, {message: error, error: true});
        return next();
      }

      if (user == null) {
        res.send(404, {message: 'invalid user', error: false});
        return next();
      }

      var user_object = JSON.parse(user);

      res.send(200, user_object.permissions);
      return next();
    })
  };

  endpoints.addUserPermission = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, get_user) {
      if (get_user == null) {
        res.send(404, {message: 'invalid user'});
        return next();
      }

      var user = JSON.parse(get_user);
      
      if (!user.permissions) {
        user.permissions = {};
      }

      user.permissions[req.body.repo] = req.body.access;

      redis.set('users:' + req.params.username, JSON.stringify(user), function(err) {
        res.send(202, {success: true});
        return next();
      });
    });
  };
  
  endpoints.removeUserPermission = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, get_user) {
      if (get_user == null) {
        res.send(404, {message: 'invalid user'});
        return next();
      }

      var user = JSON.parse(get_user);

      delete user.permissions[req.params.repo];

      redis.set('users:' + req.params.username, JSON.stringify(user), function(err) {
        if (err) {
          res.send(500, {success: false, error: err});
          return next();
        }

        res.send(200, {success: true});
        return next();
      });
    });
  };


  endpoints.createUser = function(req, res, next) {
    if (!req.body.username) {
      return next(new restify.errors.MissingParameterError("username field is required"));
    }
    if (!req.body.password) {
      return next(new restify.errors.MissingParameterError("password field is required"));
    }
    if (!req.body.email) {
      return next(new restify.errors.MissingParameterError("email field is required"));
    }

    redis.get('users:' + req.body.username, function(err, user) {
      if (err) {
        res.send(500, {message: err, error: true});
        return next();
      }
      
      if (user != null) {
        res.send(409, {messsage: 'user already exists', error: false});
        return next();
      }

      var shasum = crypto.createHash('sha1');
      shasum.update(req.body.password);
      var sha1pwd = shasum.digest('hex');

      var userObj = {
        username: req.body.username,
        password: sha1pwd,
        email: req.body.email,
        permissions: {},
        admin: req.body.admin || false
      };

      redis.set('users:' + req.body.username, JSON.stringify(userObj), function(err) {
        if (err) {
          logger.error({err: err}, "Redis Error -- Unable to Set Key");
          res.send(500, {err: err});
          return next();
        }

        redis.sadd('users', req.body.username, function(err) {
          if (err) {
            logger.error({err: err}, "Redis Error -- Unable to Set Key");
            res.send(500, {err: err});
            return next();
          }

          if (req.authmethod == 'token') {
            redis.del('_initial_auth_token', function(err) {})
          }

          res.send(201, {message: "account created", user: req.body.username});
          return next();
        });
      });
    });
  };

  endpoints.deleteUser = function(req, res, next) {
    redis.get("users:" + req.params.username, function(err, value) {
      if (err) {
        res.send(500, err);
        return next();
      }

      if (value == null) {
        res.send(404, {message: 'user does not exist'})
        return next()
      }

      redis.del("users:" + req.params.username, function(err) {
        if (err) {
          res.send(500, err);
          return next();
        }

        res.send(200, {message: 'user has been deleted'})
        return next()
      })
    })
  }

  endpoints.enableUser = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, user_json) {
      if (err) {
        res.send(500, {message: err, error: true});
        return next();
      }

      if (user_json == null) {
        res.send(409, {message: 'user does not exist', error: true});
        return next();
      }
      
      try {
        var user = JSON.parse(user_json);
      }
      catch (e) {
        return next(e);
      }
      
      var userObj = user;
      userObj.disabled = false;
      
      redis.set('users:' + req.params.username, JSON.stringify(userObj), function(err) {
        if (err) {
          logger.error({err: err}, "Redis Error -- Unable to Set Key");
          res.send(500, {err: err});
          return next();
        }
        
        res.send(201, {message: "account enabled", user: req.params.username});
        return next();
      })
    })
  };

  endpoints.disableUser = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, user_json) {
      if (err) {
        res.send(500, {message: err, error: true});
        return next();
      }
      
      if (user_json == null) {
        res.send(409, {message: 'user does not exist', error: true});
        return next();
      }
      
      try {
        var user = JSON.parse(user_json);
      }
      catch (e) {
        return next(e);
      }
      
      var userObj = user;
      userObj.disabled = true;
      
      redis.set('users:' + req.params.username, JSON.stringify(userObj), function(err) {
        if (err) {
          logger.error({err: err}, "Redis Error -- Unable to Set Key");
          res.send(500, {err: err});
          return next();
        }
        
        res.send(201, {message: "account disabled", user: req.params.username});
        return next();
      })
    })
  };

  endpoints.grantAdmin = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, user_json) {
      if (err) {
        res.send(500, {message: err, error: true});
        return next();
      }

      if (user_json == null) {
        res.send(409, {message: 'user does not exist', error: true});
        return next();
      }
      
      try {
        var user = JSON.parse(user_json);
      }
      catch (e) {
        return next(e);
      }
      
      var userObj = user;
      userObj.admin = true;
      
      redis.set('users:' + req.params.username, JSON.stringify(userObj), function(err) {
        if (err) {
          logger.error({err: err}, "Redis Error -- Unable to Set Key");
          res.send(500, {err: err});
          return next();
        }
        
        res.send(200, {message: "admin granted", user: req.params.username});
        return next();
      })
    })
  };
  
  endpoints.revokeAdmin = function(req, res, next) {
    redis.get('users:' + req.params.username, function(err, user_json) {
      if (err) {
        res.send(500, {message: err, error: true});
        return next();
      }

      if (user_json == null) {
        res.send(409, {message: 'user does not exist', error: true});
        return next();
      }
      
      try {
        var user = JSON.parse(user_json);
      }
      catch (e) {
        return next(e);
      }
      
      var userObj = user;
      userObj.admin = false;
      
      redis.set('users:' + req.params.username, JSON.stringify(userObj), function(err) {
        if (err) {
          logger.error({err: err}, "Redis Error -- Unable to Set Key");
          res.send(500, {err: err});
          return next();
        }
        
        res.send(200, {message: "admin revoked", user: req.params.username});
        return next();
      })
    })
  };

  return endpoints;

};

