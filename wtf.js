'use strict'

var uws = require('uws')

var server = uws.http.createServer(function (request, response) {
  console.log(request.headers['user-agent'])
  response.end('fuck')
})

server.listen(1337)
console.log(server)
