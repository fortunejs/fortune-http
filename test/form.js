'use strict'

const http = require('http')
const qs = require('querystring')
const FormData = require('form-data')

const run = require('tapdance')
const testInstance = require('fortune/test/integration/test_instance')
const deepEqual = require('fortune/lib/common/deep_equal')

const httpTest = require('./http_test')
const createListener = require('../lib')
const json = require('../lib/json_serializer')
const form = require('../lib/form_serializer')
const formUrlEncoded = form.formUrlEncoded
const formData = form.formData

const methodKey = '__method__'
const buffer = Buffer.from || Buffer
const options = {
  serializers: [
    json, formUrlEncoded, formData
  ]
}

const test = httpTest.bind(null, options)


run((assert, comment) => {
  comment('get anything should fail')
  return test('/', {
    headers: { 'Accept': 'application/x-www-form-urlencoded' }
  }, response => {
    assert(response.status === 415, 'status is correct')
  })
})


run((assert, comment) => {
  comment('find records using urlencoded data')
  return test(`/animal`, {
    method: 'post',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: qs.stringify({
      [methodKey]: 'find',
      'match.name': 'Babby'
    })
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.name),
      [ 'Babby' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('create records using urlencoded data')
  return test(`/animal`, {
    method: 'post',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: qs.stringify({
      name: 'Ayy lmao',
      nicknames: [ 'ayy', 'lmao' ]
    })
  }, response => {
    assert(response.status === 201, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.name),
      [ 'Ayy lmao' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('update records using urlencoded data')
  return test(`/animal`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: qs.stringify({
      [methodKey]: 'update',
      id: 1,
      name: 'Ayy lmao',
      nicknames: [ 'ayy', 'lmao' ]
    })
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')
    assert(deepEqual(response.body.records.map(record => record.name),
      [ 'Ayy lmao' ]), 'response body is correct')
  })
})


run((assert, comment) => {
  comment('create records using form data')

  let server
  let store
  const deadbeef = buffer('deadbeef', 'hex')
  const form = new FormData()
  form.append('name', 'Ayy lmao')
  form.append('picture', deadbeef,
    { filename: 'deadbeef.dump' })

  return testInstance()
  .then(s => {
    store = s
    server = http.createServer(createListener(store)).listen(4000)
  })
  .then(() => new Promise((resolve, reject) =>
    form.submit('http://localhost:4000/animal', (error, response) => error ?
      reject(error) : resolve(response))))
  .then(response => {
    assert(response.statusCode === 201, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')

    return new Promise(resolve => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
  })
  .then(payload => {
    const body = JSON.parse(payload.toString())
    assert(deepEqual(body.records.map(record => record.name),
      [ 'Ayy lmao' ]), 'name is correct')
    assert(deepEqual(body.records.map(record => record.picture),
      [ deadbeef.toString('base64') ]), 'picture is correct')
    store.disconnect()
    server.close()
  })
})


run((assert, comment) => {
  comment('update records using form data')

  let server
  let store
  const deadbeef = buffer('deadbeef', 'hex')
  const form = new FormData()
  form.append(methodKey, 'update')
  form.append('id', 1)
  form.append('name', 'Ayy lmao')
  form.append('picture', deadbeef,
    { filename: 'deadbeef.dump' })

  return testInstance()
  .then(s => {
    store = s
    server = http.createServer(createListener(store)).listen(4001)
  })
  .then(() => new Promise((resolve, reject) =>
    form.submit({
      host: 'localhost',
      port: 4001,
      path: '/animal',
    }, (error, response) => error ?
      reject(error) : resolve(response))))
  .then(response => {
    assert(response.statusCode === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf('application/json'),
      'content type is correct')

    return new Promise(resolve => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
  })
  .then(payload => {
    const body = JSON.parse(payload.toString())
    assert(deepEqual(body.records.map(record => record.name),
      [ 'Ayy lmao' ]), 'name is correct')
    assert(deepEqual(body.records.map(record => record.picture),
      [ deadbeef.toString('base64') ]), 'picture is correct')
    store.disconnect()
    server.close()
  })
})
