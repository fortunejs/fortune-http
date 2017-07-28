'use strict'

var HttpSerializer = require('./serializer')
var initializeContext = require('./initialize_context')
var encodeRoute = require('./encode_route')


module.exports = instantiateSerializer


function instantiateSerializer (instance, serializer, options, serializers) {
  var serializerType = typeof serializer
  var CustomSerializer, mediaType

  if (serializerType === 'undefined')
    throw new TypeError('A serializer is missing.')

  if (serializerType !== 'function')
    throw new TypeError('The HTTP serializer must be a function.')

  if (options === void 0) options = {}

  CustomSerializer = HttpSerializer.prototype
    .isPrototypeOf(serializer.prototype) ?
    serializer : serializer(HttpSerializer)

  if (!HttpSerializer.prototype.isPrototypeOf(CustomSerializer.prototype))
    throw new TypeError('The serializer must inherit the HttpSerializer ' +
      'class.')

  mediaType = CustomSerializer.mediaType

  if (typeof mediaType !== 'string')
    throw new TypeError('A media type must be defined as a string for the ' +
      'HttpSerializer.')

  return new CustomSerializer({
    common: instance.common,
    methods: instance.common.methods,
    errors: instance.common.errors,
    keys: instance.common.keys,
    recordTypes: instance.recordTypes,
    castValue: instance.common.castValue,
    castToNumber: instance.common.castToNumber,
    initializeContext: initializeContext(instance),
    encodeRoute: encodeRoute,
    options: options,
    serializers: serializers,
    mediaType: mediaType,

    // This is the settings defined in the Fortune instance, not the HTTP
    // specific settings.
    settings: instance.options.settings,
    documentation: instance.options.documentation,

    adapter: instance.adapter,
    message: instance.message || instance.common.message,

    // For backwards compatibility issues.
    Promise: Promise
  })
}
