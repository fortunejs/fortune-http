# Fortune HTTP

[![Build Status](https://img.shields.io/travis/fortunejs/fortune-http/master.svg?style=flat-square)](https://travis-ci.org/fortunejs/fortune-http)
[![npm Version](https://img.shields.io/npm/v/fortune-http.svg?style=flat-square)](https://www.npmjs.com/package/fortune-http)
[![License](https://img.shields.io/npm/l/fortune-http.svg?style=flat-square)](https://raw.githubusercontent.com/fortunejs/fortune-http/master/LICENSE)

This is a HTTP implementation for Fortune.js, which includes default serializers for JSON, HTML, form encoded and form data. **This module is required for other HTTP serializers.**

```sh
$ npm install fortune-http --save
```


## Usage

Consult the [source code](https://github.com/fortunejs/fortune-http/tree/master/lib) or the [documentation website](http://fortune.js.org/api) for more information.

```js
const http = require('http')
const fortuneHTTP = require('fortune-http')

// Pass in a Fortune instance and an optional options object.
const listener = fortuneHTTP(fortuneInstance, options)

const server = http.createServer((request, response) =>
  listener(request, response)
  // Make sure to catch Promise rejections.
  .catch(error => {
    console.error(error.stack)
  }))
```

For use with middleware frameworks such as Express:

```js
const express = require('express')
const fortuneHTTP = require('fortune-http')

const app = express()
const listener = fortuneHTTP(fortuneInstance, options)

// Make sure that the Fortune listener is last in the middleware stack,
// since it ends the response by default (this can be optionally disabled).
app.use((request, response) =>
  listener(request, response)
  .catch(error => { ... }))
```


## Demo

By installing the development dependencies, one can run the test instance locally:

```
$ npm i && npm run demo
```


## License

This software is licensed under the [MIT license](https://raw.githubusercontent.com/fortunejs/fortune-http/master/LICENSE).
