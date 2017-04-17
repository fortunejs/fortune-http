'use strict'

const zlib = require('zlib')
const run = require('tapdance')
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
    JSON.parse(String(zlib.gunzipSync(Buffer.from(response.body))))
    assert(true, 'response compressed correctly')
  })
})
