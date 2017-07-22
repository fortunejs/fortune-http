'use strict'

let uws

try {
  uws = require('uws')
}
catch (error) {
  // Ignore error.
}

const http = require('http')
const chalk = require('chalk')

const createListener = require('../lib')
const fortune = require('fortune')
const testInstance = require('fortune/test/integration/test_instance')
const stderr = require('fortune/test/stderr')


module.exports = function httpTest (options, path, request, fn, change) {
  let store
  let server

  return testInstance()
    .then(instance => {
      store = instance

      if (typeof change === 'function')
        store.on(fortune.change, data => change(data, fortune.methods))

      server = (options && options.uws ? uws.http : http)
        .createServer((request, response) =>
          createListener(store, options)(request, response)
            .catch(error => stderr.error(error)))

      return new Promise(resolve => server.listen(resolve))
    })
    .then(() => {
      let port = server.address().port
      let headers
      let status

      if (request) {
        if ('method' in request) request.method = request.method.toUpperCase()
        if (!request.headers) request.headers = {}
        if (typeof request.body === 'object') {
          request.body = JSON.stringify(request.body)
          request.headers['content-length'] = Buffer.byteLength(request.body)
        }
      }
      else request = { headers: {} }
      request.headers['connection'] = 'keep-alive'

      return new Promise((resolve, reject) =>
        http.request(Object.assign({ port, path }, request), response => {
          headers = response.headers
          status = response.statusCode

          const chunks = []

          response.on('error', reject)
          response.on('data', chunk => chunks.push(chunk))
          response.on('end', () => resolve(Buffer.concat(chunks)))
        }).end(request ? request.body : null))

      .then(response => {
        // uws server seems to be temporal.
        if (server) server.close()

        stderr.debug(chalk.bold('Response status: ' + status))
        stderr.debug(headers)
        return store.disconnect().then(() => response)
      })

      .then(body => {
        if (body.length)
          try {
            body = JSON.parse(body.toString())
            stderr.log(body)
          }
          catch (error) {
            // If it couldn't be parsed as JSON, not a problem.
            stderr.warn(body)
          }

        return fn({ status, headers, body })
      })
    })

    .catch(error => {
      stderr.error(error)
      if (server) server.close()
      throw error
    })
}
