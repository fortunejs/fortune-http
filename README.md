# Fortune HTTP

[![Build Status](https://img.shields.io/travis/fortunejs/fortune-http/master.svg?style=flat-square)](https://travis-ci.org/fortunejs/fortune-http)
[![npm Version](https://img.shields.io/npm/v/fortune-http.svg?style=flat-square)](https://www.npmjs.com/package/fortune-http)
[![License](https://img.shields.io/npm/l/fortune-http.svg?style=flat-square)](https://raw.githubusercontent.com/fortunejs/fortune-http/master/LICENSE)

This is a HTTP implementation for Fortune.js, which includes default serializers for JSON, HTML, form encoded and form data.

```sh
$ npm install fortune-http --save
```


## Usage

Consult the [source code](https://github.com/fortunejs/fortune-http/tree/master/lib) or the [documentation website](http://fortune.js.org/api) for more information.

```js
const http = require('http')
const createListener = require('fortune-http')

// Pass in a Fortune instance and an optional options object.
const server = http.createServer(createListener(fortune, options))
```


## License

This software is licensed under the [MIT license](https://raw.githubusercontent.com/fortunejs/fortune-http/master/LICENSE).
