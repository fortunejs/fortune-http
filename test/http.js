'use strict'

const zlib = require('zlib')
const http = require('http')
const run = require('tapdance')
const testInstance = require('fortune/test/integration/test_instance')
const createListener = require('../lib')
const httpTest = require('./http_test')
const test = httpTest.bind(null, void 0)


run((assert, comment) => {
  comment('content type negotiation')
  return test('/', {
    headers: { 'accept': 'application/octet-stream' }
  }, response => {
    assert(response.status === 406, 'status is correct')
  })
})

run((assert, comment) => {
  comment('content encoding negotiation')
  return test('/', {
    headers: { 'accept-encoding': 'gzip, deflate' }
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(response.headers['content-encoding'] === 'gzip', 'encoding is correct')

    // We're expecting JSON as the default content type.
    const body = JSON.parse(String(zlib.gunzipSync(Buffer.from(response.body))))
    assert(Object.keys(body).length, 'response compressed correctly')
  })
})

run((assert, comment) => {
  comment('request rate check')

  return failRequest({ 'Content-Length': '1' })
    .then(response => {
      assert(response.statusCode === 408, 'request timed out')
    })
})

run((assert, comment) => {
  comment('request size check')

  return failRequest({})
    .then(response => {
      assert(response.statusCode === 411, 'content-length required')
      return failRequest({
        'Content-Length': 2 * Math.pow(2, 20) + 1
      })
    })
    .then(response => {
      assert(response.statusCode === 413, 'request too large')
    })
})


function failRequest (headers) {
  let server

  return testInstance()
    .then(store => {
      server = http.createServer((request, response) => {
        createListener(store, {
          settings: {
            // For forcing the test to time out faster.
            rateCheckMS: 100
          }
        })(request, response).catch(() => null)
      })
      return new Promise(resolve => server.listen(resolve))
    })
    .then(() => {
      let port = server.address().port
      let httpRequest = http.request({
        port, path: '/', method: 'POST', headers
      })

      httpRequest.flushHeaders()

      return new Promise(resolve =>
        httpRequest.on('response', resolve))
    })
}
