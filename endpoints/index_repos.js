
module.exports = function(config, redis, logger) {
  var index_helpers = require('../index/helpers.js')(config, redis, logger);
  var index_middleware = require('../index/middleware.js')(config, redis, logger);
  var index_repos = require('../index/repos.js')(config, redis, logger);
  var webhooks = require('../lib/webhooks.js')(config, redis, logger);

  var endpoints = {
    name: 'Index Repositories Endpoints',
    description: 'Endpoints for Repository Interaction',
    endpoints: [
      {
        name: 'putLibraryRepo',
        description: 'Get Library Repository',
        method: 'PUT',
        path: [
          '/v1/repositories/:repo',
          '/v1/repositories/:namespace/:repo'
        ],
        version: '1.0.0',
        fn: index_repos.repoPut,
        middleware: [
          index_middleware.requireAuth
        ],
        afterware: [
          webhooks.processWebhooks
        ]
      },
      
      {
        name: 'deleteLibraryRepo',
        description: 'Delete a Repository',
        method: 'DELETE',
        path: [
          '/v1/repositories/:repo',
          '/v1/repositories/:namespace/:repo'
        ],
        version: '1.0.0',
        fn: index_repos.repoDelete,
        middleware: [ index_middleware.requireAuth ]
      },
      
      {
        name: 'authLibraryRepo',
        description: 'Authenticate access to a repository',
        method: 'PUT',
        path: [
          '/v1/repositories/:repo/auth',
          '/v1/repositories/:namespace/:repo/auth'
        ],
        version: '1.0.0',
        fn: function (req, res, next) {
          res.send(200);
          return next();
        },
        middleware: [ index_middleware.requireAuth ]
      }
    ]
  };

  return endpoints
}
