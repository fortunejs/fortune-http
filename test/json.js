'use strict'

const qs = require('querystring')
const run = require('tapdance')
const deepEqual = require('fortune/lib/common/deep_equal')

const httpTest = require('./http_test')
const jsonSerializer = require('../lib/json_serializer')


const test = httpTest.bind(null, {
  serializers: [ jsonSerializer ]
})


run((assert, comment) => {
  comment('get index')
  return test('/', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(Object.keys(response.body.recordTypes), [ 'user', 'animal', '☯' ]),
      'response body is correct')
  })
})


run((assert, comment) => {
  comment('get empty collection')
  return test(encodeURI('/☯'), null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body, { records: [], count: 0 }), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('get records')
  return test('/user', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(response.body.records.length === 3, 'response body is correct')
  })
})


run((assert, comment) => {
  comment('get records by ID')
  return test('/animal/1,%2Fwtf', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.id),
      [ 1, '/wtf' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('get records with fields')
  return test(`/animal?${qs.stringify({
    fields: [ 'name', 'owner' ]
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records
      .map(record => Object.keys(record).length),
      [ 4, 4, 4, 4 ]), 'response body fields are correct')
  })
})


run((assert, comment) => {
  comment('get records with match')
  return test(`/animal?${qs.stringify({
    'match.name': 'Babby'
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(response.body.records[0].name === 'Babby', 'match is correct')
  })
})


run((assert, comment) => {
  comment('get records with match by link')
  return test(`/animal?${qs.stringify({
    'match.owner': 1
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(response.body.records[0].name === 'Babby', 'match is correct')
  })
})


run((assert, comment) => {
  comment('get records with include')
  return test(`/animal/1?${qs.stringify({
    'include': [ 'owner', 'owner.spouse' ]
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(response.body.records[0].id === 1, 'ID is correct')
    assert(deepEqual(response.body.include.user.map(record => record.id),
      [ 1, 2 ]), 'IDs are correct')
  })
})


run((assert, comment) => {
  comment('get records with sort/limit/offset')
  return test(`/animal?${qs.stringify({
    sort: 'name',
    limit: 2,
    offset: 1
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.name),
      [ 'Babby', 'Kantorin' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('create records')
  return test(`/animal`, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: [ {
      name: 'Ayy lmao',
      nicknames: [ 'ayy', 'lmao' ],
      owner: 1
    } ]
  }, response => {
    assert(response.status === 201, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.name),
      [ 'Ayy lmao' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('update records')
  return test(`/animal`, {
    method: 'patch',
    headers: { 'Content-Type': 'application/json' },
    body: [ {
      id: '/wtf',
      replace: { name: 1234 }
    } ]
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.name),
      [ '1234' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('delete records')
  return test(`/animal/1,%2Fwtf`, {
    method: 'delete'
  }, response => {
    assert(response.status === 204, 'status is correct')
    assert(response.body.length === 0, 'body is empty')
  })
})


run((assert, comment) => {
  comment('respond to options: index')
  return test('/', { method: 'options' }, response => {
    assert(response.status === 204, 'status is correct')
    assert(response.body.length === 0, 'body is empty')
    assert(response.headers['allow'] === 'GET',
      'allow header is correct')
  })
})
