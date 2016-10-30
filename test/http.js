'use strict'

const run = require('tapdance')
const httpTest = require('./http_test')
const test = httpTest.bind(null, void 0)


run((assert, comment) => {
  comment('content negotiation')
  return test('/', {
    headers: { 'Accept': 'application/octet-stream' }
  }, response => {
    assert(response.status === 406, 'status is correct')
  })
})
