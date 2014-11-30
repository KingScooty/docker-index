var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var restify = require('restify');
var util = require('util');

module.exports = function(redis, logger) {

  var endpoints = {};

  endpoints.listWebhooks = function (req, res, next) {
    if (!req.params.namespace)
      req.params.namespace = 'library';

    var webhooks_key = util.format('webhooks:%s_%s', req.params.namespace, req.params.repo);

    redis.smembers(webhooks_key, function(err, webhooks) {
      next.ifError(err);

      var all_webhooks = [];

      async.eachSeries(webhooks, function(webhook, callback) {
        var webhook_key = util.format('webhooks:%s_%s:%s', req.params.namespace, req.params.repo, webhook)
        redis.get(webhook_key, function(err, hook) {
          if (err) return callback(err);
          all_webhooks.push(hook);
          callback(null);
        });
      }, function(err) {
        next.ifError(err);
        res.send(200, all_webhooks);
        return next();
      });
    })
  };

  endpoints.addWebhook = function (req, res, next) {
    if (!req.params.namespace)
      req.params.namespace = 'library';

    var webhooks_key = util.format('webhooks:%s_%s', req.params.namespace, req.params.repo);
    var webhook_id = crypto.createHash('sha1')
      .update(req.body.url)
      .digest('hex');
    var webhook_key = util.format('webhooks:%s_%s:%s', req.params.namespace, req.params.repo, webhook_id);

    redis.get(webhook_key, function(err, exists) {
      next.ifError(err);

      if (exists) {
        res.send(409, {message: 'webhook exists'});
        return next();
      }

      redis.sadd(webhooks_key, webhook_id, function(err) {
        next.ifError(err);

        redis.set(webhook_key, req.body.url, function(err, success) {
          next.ifError(err);

          res.send(201, {message: 'webhook created', 'id': webhook_id});
          return next();
        });
      });
    });
  };
  
  endpoints.removeWebhook = function (req, res, next) {
    if (!req.params.namespace)
      req.params.namespace = 'library';

    var webhooks_key = util.format('webhooks:%s_%s', req.params.namespace, req.params.repo);
    var webhook_id = req.params.webhook_id;
    var webhook_key = util.format('webhooks:%s_%s:%s', req.params.namespace, req.params.repo, webhook_id);

    redis.get(webhook_key, function(err, exists) {
      next.ifError(err);

      if (exists) {
        redis.srem(webhooks_key, webhook_id, function(err, success) {
          next.ifError(err);

          redis.del(webhook_key, function(err, success) {
            next.ifError(err);
        
            res.send(200, {message: 'webhook deleted'});
            return next();
          })
        });
      } 
      else {
        res.send(404, {message: 'webhook does not exist'});
        return next(); 
      }      
    });
  };

  endpoints.removeWebhookAll = function (req, res, next) {
    if (!req.params.namespace)
      req.params.namespace = 'library';
    
    var webhooks_key = util.format('webhooks:%s_%s', req.params.namespace, req.params.repo);

    redis.smembers(webhooks_key, function(err, webhooks) { 
      next.ifError(err);
      
      async.eachSeries(webhooks, function(webhook, callback) {
        redis.del(webhook, function(err, success) {
          if (err) return callback(err);
          
          callback(null);
        })
      }, function (err) {
        next.ifError(err);
        
        redis.del(webhooks_key, function(err, success) {
          next.ifError(err);

          res.send(200, {message: 'webhooks deleted'});
          return next();
        });
      });
    });
  };

  return endpoints;

};

