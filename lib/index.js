'use strict'

var zlib = require('zlib')
var crc32 = require('fast-crc32c')
var Negotiator = require('negotiator')

var HttpSerializer = require('./serializer')
var jsonSerializer = require('./json_serializer')
var htmlSerializer = require('./html_serializer')
var HttpFormSerializer = require('./form_serializer')
var statusMapFn = require('./status_map')
var instantiateSerializer = require('./instantiate_serializer')
var whitelistedHeaders = require('./whitelisted_headers')

var beforeSemicolon = /[^;]*/
var availableEncodings = [ 'gzip', 'deflate' ]
var payloadMethods = [ 'POST', 'PATCH', 'PUT' ]
var buffer = Buffer.from || Buffer


/**
 * **Node.js only**: This function implements a HTTP server for Fortune.
 *
 * ```js
 * const http = require('http')
 * const fortuneHTTP = require('fortune-http')
 *
 * const listener = fortuneHTTP(fortuneInstance, options)
 * const server = http.createServer((request, response) =>
 *   listener(request, response)
 *   .catch(error => {
 *     // error logging
 *   }))
 * ```
 *
 * It determines which serializer to use, assigns request headers
 * to the `meta` object, reads the request body, and maps the response from
 * the `request` method on to the HTTP response. The listener function ends the
 * response and returns a promise that is resolved when the response is ended.
 * The returned promise may be rejected with the error response, providing a
 * hook for error logging.
 *
 * The options object may be formatted as follows:
 *
 * ```js
 * {
 *   // An array of HTTP serializers, ordered by priority. Defaults to ad hoc
 *   // JSON and form serializers if none are specified. If a serializer value
 *   // is not an array, its settings will be considered omitted.
 *   serializers: [
 *     [
 *       // A function that subclasses the HTTP Serializer.
 *       HttpSerializerSubclass,
 *
 *       // Settings to pass to the constructor, optional.
 *       { ... }
 *     ]
 *   ],
 *   settings: {
 *     // By default, the listener will end the response, set this to `false`
 *     // if the response will be ended later.
 *     endResponse: true,
 *
 *     // Use compression if the request `Accept-Encoding` header allows it.
 *     // Note that Buffer-typed responses will not be compressed. This option
 *     // should be disabled in case of a reverse proxy which handles
 *     // compression.
 *     useCompression: true,
 *
 *     // Use built-in ETag implementation, which uses CRC32 for generating
 *     // weak ETags under the hood. This option should be disabled in case of
 *     // a reverse proxy which handles ETags.
 *     useETag: true,
 *
 *     // Ensure that the request is sent at an acceptable rate, to prevent
 *     // abusive slow requests. This is given in terms of kilobits per second
 *     // (kbps). Default: `28.8`, based on slow modem speed.
 *     minimumRateKBPS: 28.8,
 *
 *     // Ensure that requests can not be larger than a specific size, to
 *     // prevent abusive large requests. This is given in terms of megabytes
 *     // (MB). Default: `2`, based on unformatted 3.5" floppy disk capacity.
 *     // Use a falsy value to turn this off (not recommended).
 *     maximumSizeMB: 2,
 *
 *     // How often to check for request rate in milliseconds (ms).
 *     // Default: 3000.
 *     rateCheckMS: 3000
 *   }
 * }
 * ```
 *
 * The main export contains the following keys:
 *
 * - `Serializer`: HTTP Serializer class.
 * - `JsonSerializer`: JSON over HTTP serializer.
 * - `HtmlSerializer`: HTML serializer.
 * - `FormDataSerializer`: Serializer for `multipart/formdata`.
 * - `FormUrlEncodedSerializer`: Serializer for
 *   `application/x-www-form-urlencoded`.
 * - `instantiateSerializer`: an internal function with the signature
 *   (`instance`, `serializer`, `options`), useful if one needs to get an
 *   instance of the serializer without the HTTP listener.
 *
 * @param {Fortune} instance
 * @param {Object} [options]
 * @return {Function}
 */
function createListener (instance, options) {
  var mediaTypes = []
  var serializers = {}
  var serializer, input
  var settings, endResponse, useCompression, useETag
  var minimumRate, maximumSize, rateCheckMS, minimumRateSize
  var errors, nativeErrors
  var BadRequestError, UnsupportedError, NotAcceptableError
  var assign, message, responses, statusMap
  var i, j

  if (!instance.request || !instance.common)
    throw new TypeError('An instance of Fortune is required.')

  assign = instance.common.assign
  message = instance.message || instance.common.message
  responses = instance.common.responses
  statusMap = statusMapFn(responses)

  errors = instance.common.errors
  nativeErrors = errors.nativeErrors
  BadRequestError = errors.BadRequestError
  UnsupportedError = errors.UnsupportedError
  NotAcceptableError = errors.NotAcceptableError

  if (options === void 0) options = {}
  if (!('serializers' in options))
    options.serializers = [
      jsonSerializer(HttpSerializer),
      htmlSerializer(HttpSerializer),
      HttpFormSerializer.formData,
      HttpFormSerializer.formUrlEncoded
    ]
  if (!('settings' in options)) options.settings = {}
  settings = options.settings

  if (!options.serializers.length)
    throw new Error('At least one serializer must be defined.')

  for (i = 0, j = options.serializers.length; i < j; i++) {
    input = Array.isArray(options.serializers[i]) ?
      options.serializers[i] : [ options.serializers[i] ]

    serializer = instantiateSerializer(
      instance, input[0], input[1], serializers)
    serializers[serializer.mediaType] = serializer
    mediaTypes.push(serializer.mediaType)
  }

  endResponse = 'endResponse' in settings ? settings.endResponse : true
  useETag = 'useETag' in settings ? settings.useETag : true
  useCompression = 'useCompression' in settings ?
    settings.useCompression : true

  // Values are converted from bits to bytes, since buffer lengths are
  // measured in bytes.
  minimumRate = 'minimumRateKBPS' in settings ?
    settings.minimumRateKBPS * Math.pow(2, 3) : 28.8 * Math.pow(2, 3)

  // Convert from MB to bytes.
  maximumSize = 'maximumSizeMB' in settings ?
    settings.maximumSizeMB * Math.pow(2, 20) : 2 * Math.pow(2, 20)

  rateCheckMS = 'rateCheckMS' in settings ?
    settings.rateCheckMS : 3000

  minimumRateSize = Math.floor(minimumRate / (rateCheckMS / 1000))

  // Expose HTTP status code map.
  listener.statusMap = statusMap

  return listener

  // We can take advantage of the closure which has a reference to the
  // Fortune instance.
  function listener (request, response) {
    var encoding, payload, isProcessing, contextResponse
    var negotiator, language, serializerOutput, serializerInput, contextRequest
    var header, headers, nativeHeaders, i, j

    // Some initialization for the below monkey-patching.
    response.headers = {}
    for (header in response['_headers'])
      response.headers[header] = response['_headers'][header]

    response['_removeHeader'] = response.removeHeader
    response['_setHeader'] = response.setHeader
    response['_getHeader'] = response.getHeader

    // This function doesn't exist in uws.
    response.removeHeader = removeHeader

    // Monkey-patch these methods so uws can use them.
    response.setHeader = setHeader
    response.getHeader = getHeader

    // A white-list of headers must be read and memoized in a JS object to be
    // compatible with uws. This is one of the most peculiar behaviors of
    // binding C++ in JS, the object acts as a proxy to read memory directly,
    // and its keys can't be enumerated.
    nativeHeaders = request.headers
    headers = {}
    for (i = 0, j = whitelistedHeaders.length; i < j; i++) {
      header = whitelistedHeaders[i]
      if (header in nativeHeaders) headers[header] = nativeHeaders[header]
    }
    request.headers = headers

    negotiator = new Negotiator(request)
    language = negotiator.language()

    // Using Negotiator to get the highest priority media type.
    serializerOutput = negotiator.mediaType(mediaTypes)

    // Get the media type of the request.
    // See RFC 2045: https://www.ietf.org/rfc/rfc2045.txt
    serializerInput = beforeSemicolon
      .exec(request.headers['content-type'] || '')[0] || null

    contextRequest = {
      meta: {
        request: request,
        headers: request.headers,
        language: language
      }
    }

    // Invalid media type requested. The `undefined` return value comes from
    // the Negotiator library.
    if (serializerOutput === void 0)
      serializerOutput = negotiator.mediaType()

    response.setHeader('Content-Type', serializerOutput)

    if (useCompression) {
      encoding = negotiator.encoding(availableEncodings)
      if (encoding) response.setHeader('Content-Encoding', encoding)
    }

    // Set status code to null value, which we can check later if status code
    // should be overwritten or not.
    response.statusCode = null

    return (!serializers.hasOwnProperty(serializerOutput) ?
      Promise.reject(new NotAcceptableError(message(
        'SerializerNotFound', language, { id: serializerOutput }))) :
      new Promise(function (resolve, reject) {
        var chunks, previousLength, currentLength
        var requestLength, rateInterval

        if (!~payloadMethods.indexOf(request.method) &&
          !('content-length' in request.headers))
          return resolve()

        // All requests with payloads expected must have a
        // Content-Length header.
        if (!('content-length' in request.headers)) {
          response.statusCode = 411
          return reject(Error())
        }

        // Read the request body before continuing.
        requestLength = parseInt(request.headers['content-length'], 10)

        if (requestLength === 0) return resolve()

        if (requestLength > maximumSize) {
          response.statusCode = 413
          return reject(Error())
        }

        chunks = []
        previousLength = 0
        currentLength = 0
        rateInterval = setInterval(function () {
          if (currentLength - previousLength < minimumRateSize) {
            clearInterval(rateInterval)
            response.statusCode = 408
            reject(Error())
          }
          else previousLength = currentLength
        }, rateCheckMS)

        request.on('error', function (error) {
          response.setHeader('Content-Type', 'text/plain')
          error.payload = message('InvalidBody', language)
          Object.defineProperty(error, 'isInputError', { value: true })
          reject(error)
        })

        request.on('data', function (chunk) {
          currentLength += chunk.length
          if (currentLength > maximumSize) {
            response.statusCode = 413
            reject(Error())
          }
          chunks.push(buffer(chunk))
        })

        request.on('end', function () {
          clearInterval(rateInterval)
          resolve(Buffer.concat(chunks))
        })

        return null
      }))

      .then(function (body) {
        if (body && body.length) payload = body

        return serializers[serializerOutput]
          .processRequest(contextRequest, request, response)
      })

      .then(function (result) {
        if (result) contextRequest = result
        if (!serializerInput) return contextRequest

        if (!serializers.hasOwnProperty(serializerInput))
          throw new UnsupportedError(message(
            'SerializerNotFound', language, { id: serializerInput }))

        contextRequest.payload = payload

        return Promise.resolve()
          .then(function () {
            return payload && payload.length ?
              serializers[serializerInput]
                .parsePayload(contextRequest, request, response) : null
          })
          .then(function (result) {
            if (result) contextRequest.payload = result
            return contextRequest
          }, function (error) {
            Object.defineProperty(error, 'isInputError', { value: true })
            throw error
          })
      })

      .then(function (contextRequest) {
        return instance.request(contextRequest)
      })

      .then(function (result) {
        contextResponse = result
        isProcessing = true

        return serializers[serializerOutput]
          .processResponse(contextResponse, request, response)
      })

      .then(function (result) {
        return end(result || contextResponse, request, response)
      })

      .catch(function (error) {
        var exposedError = error

        return Promise.resolve()
          .then(function () {
            if (!('payload' in error || 'meta' in error) &&
              ~nativeErrors.indexOf(error.constructor)) {
              if (contextResponse) delete contextResponse.payload
              exposedError = assign(error.isInputError ?
                new BadRequestError(message('InvalidBody', language)) :
                new Error(message('GenericError', language)),
              contextResponse)
            }

            return !isProcessing &&
              serializers.hasOwnProperty(serializerOutput) ?
              serializers[serializerOutput]
                .processResponse(exposedError, request, response) :
              exposedError
          })
          .then(function (result) {
            return end(result || exposedError, request, response)
          }, function () {
            return end(new Error(message('GenericError', language)),
              request, response)
          })
          .then(function () {
            // Do not reject exceptions that result in non-error status codes.
            if (response.statusCode < 400) return error

            throw error
          })
      })
  }

  // Internal function to end the response.
  function end (contextResponse, request, response) {
    var encoding, payload, meta

    if (!('meta' in contextResponse)) contextResponse.meta = {}
    if (!('headers' in contextResponse.meta)) contextResponse.meta.headers = {}
    meta = contextResponse.meta
    payload = contextResponse.payload

    // Expose response object downstream.
    meta.response = response

    if (response.statusCode === null)
      response.statusCode = statusMap.get(contextResponse.constructor) ||
        statusMap.get(Error)

    return new Promise(function (resolve, reject) {
      if (Buffer.isBuffer(payload) || typeof payload === 'string') {
        encoding = response.getHeader('content-encoding')

        if (encoding && ~availableEncodings.indexOf(encoding))
          return zlib[encoding](payload, function (error, result) {
            if (error) throw error
            payload = contextResponse.payload = result
            response.setHeader('Content-Length', String(payload.length))
            return resolve()
          })

        response.removeHeader('content-encoding')
        payload = contextResponse.payload = buffer(payload)
        response.setHeader('Content-Length', String(payload.length))
        return resolve()
      }

      if (payload) {
        response.statusCode = statusMap.get(Error)
        return reject(new Error('Response payload type is invalid.'))
      }

      // Handle empty response.
      response.removeHeader('content-encoding')
      response.removeHeader('content-type')
      if (response.statusCode === statusMap.get(responses.OK))
        response.statusCode = (statusMap.get(responses.Empty))
      payload = contextResponse.payload = ''
      return resolve()
    })
      .then(function () {
        var field, etag

        for (field in meta.headers)
          response.setHeader(field, meta.headers[field])

        if (useETag && payload) {
          etag = 'W/' + crc32.calculate(payload).toString(16)
          response.setHeader('ETag', etag)

          if (!endResponse) return contextResponse

          if (request.headers['if-none-match'] === etag) {
            response.statusCode = 304
            response.removeHeader('Content-Encoding')
            response.removeHeader('Content-Type')
            response.removeHeader('Content-Length')
            response.writeHead(response.statusCode, response.headers)

            // Ignore error if client doesn't receive response.
            response.end()

            return contextResponse
          }
        }

        else if (!endResponse) return contextResponse

        response.writeHead(response.statusCode, response.headers)

        // Ignore error if client doesn't receive response.
        response.end(payload)

        return contextResponse
      })
      .catch(function (error) {
        var message = error.toString()

        if (response.statusCode === null)
          response.statusCode = statusMap.get(Error)

        response.removeHeader('content-encoding')

        if (message) {
          response.setHeader('Content-Type', 'text/plain')
          response.setHeader('Content-Length', Buffer.byteLength(message))
        }

        response.writeHead(response.statusCode, response.headers)

        // Ignore error if client doesn't receive response.
        response.end(message)

        return error
      })
  }
}


function removeHeader (key) {
  if (this['_removeHeader']) this['_removeHeader'](key)
  delete this.headers[key]
}

function setHeader (key, value) {
  if (this['_setHeader']) this['_setHeader'](key, value)
  this.headers[key] = value
}

function getHeader (key) {
  if (this['_getHeader']) return this['_getHeader'](key)
  return this.headers[key]
}


// Expose instantiation method.
createListener.instantiateSerializer = instantiateSerializer

// Expose HTTP Serializer class, and defaults.
createListener.Serializer = HttpSerializer
createListener.JsonSerializer = jsonSerializer(HttpSerializer)
createListener.HtmlSerializer = htmlSerializer(HttpSerializer)
createListener.FormDataSerializer = HttpFormSerializer.formData
createListener.FormUrlEncodedSerializer = HttpFormSerializer.formUrlEncoded


module.exports = createListener
