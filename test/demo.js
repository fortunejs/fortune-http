'use strict'

const http = require('http')
const util = require('util')
const chalk = require('chalk')
const loremIpsum = require('lorem-ipsum')
const instance = require('fortune/test/integration/test_instance')
const createListener = require('../lib')

const port = 1337

instance().then(store => {
  store.options.settings.name = 'Fortune Test Web Service'

  /* eslint-disable max-len */
  store.options.settings.description = '<p>This is a demo of the default HTML interface of <code>fortune-http</code>. This interface exposes most of the features of Fortune.js. Notably, it does not require JavaScript to use.</p>'
  /* eslint-enable max-len */

  store.options.documentation = {}

  const opts = {
    count: 3,
    units: 'sentences'
  }

  for (const type in store.recordTypes) {
    store.options.documentation[type] = loremIpsum(opts)
    for (const field in store.recordTypes[type])
      store.options.documentation[field] = loremIpsum(opts)
  }

  /*store.on(store.common.events.change, data => console.log(chalk.cyan(
    `${chalk.bold('Change')}: ${util.inspect(data, { depth: null })}`)))*/

  const listener = createListener(store)
  const server = http.createServer((request, response) =>
    listener(request, response)
    .catch(error => {
      console.error(error.stack)
    }))

  server.listen(port, () =>
    console.log(`# ${chalk.green(`Listening on port ${port}...`)}`))
})
