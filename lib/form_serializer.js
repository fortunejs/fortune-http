'use strict'

var stream = require('stream')
var cookie = require('cookie')
var Busboy = require('busboy')

var methodOverride = '__method__'

function inherit (HttpSerializer) {
  var common, assign, castToNumber, methods, errors, keys, castValue
  var initializeContext, attachQueries

  function FormSerializer (properties) {
    var messages

    HttpSerializer.call(this, properties)
    common = this.common
    assign = common.assign
    castToNumber = common.castToNumber
    methods = common.methods
    errors = common.errors
    keys = common.keys
    castValue = common.castValue
    initializeContext = this.initializeContext
    attachQueries = initializeContext.attachQueries
    messages = this.message[this.message.defaultLanguage]
    messages['CSRFFailure'] = 'CSRF Failure!'
  }

  FormSerializer.prototype = Object.create(HttpSerializer.prototype)


  FormSerializer.prototype.processRequest = function (contextRequest) {
    throw new errors.UnsupportedError(
      this.message('InputOnly', contextRequest.meta.language))
  }


  FormSerializer.prototype.parsePayload = function (contextRequest, request) {
    var self = this
    var message = self.message
    var BadRequestError = errors.BadRequestError
    var primaryKey = keys.primary
    var language = contextRequest.meta.language
    var cookies = 'cookie' in request.headers ?
      cookie.parse(request.headers['cookie']) : {}

    return parse.call(this, contextRequest)

      .then(function (record) {
        var method = contextRequest.method
        var id, key

        for (key in cookies) {
          if (record['CSRF_' + key] !== cookies[key])
            throw new BadRequestError(message('CSRFFailure', language))
          delete record['CSRF_' + key]
        }

        if (methodOverride in record) {
          method = contextRequest.method = request.meta.method =
            record[methodOverride]
          delete record[methodOverride]
        }

        if (method === methods.find)
          // This might seem out of place, but is used for interpreting a POST
          // payload as a request.
          attachQueries.call(self, contextRequest, record)

        else if (method === methods.create) return [ record ]

        else if (method === methods.update) {
          id = castToNumber(contextRequest.ids ?
            contextRequest.ids[0] : record[primaryKey])

          if (!id) throw new BadRequestError(message('MissingID', language))
          delete record[primaryKey]

          return [
            {
              id: id,
              replace: record
            }
          ]
        }

        // Return nothing for find and delete method.
        return null
      })
  }


  return FormSerializer


  // Internal helper method.
  function parse (contextRequest) {
    var self = this
    var BadRequestError = errors.BadRequestError
    var language = contextRequest.meta.language
    var headers = contextRequest.meta.headers
    var payload = contextRequest.payload
    var type = contextRequest.type
    var message = self.message
    var recordTypes = self.recordTypes
    var options = self.options
    var opts = { language: contextRequest.meta.language }
    var isArrayKey = keys.isArray
    var typeKey = keys.type
    var fields = recordTypes[type]
    var busboy = new Busboy({ headers: headers })
    var bufferStream = new stream.PassThrough()
    var record = {}

    return new Promise(function (resolve, reject) {
      busboy.on('file', function (field, file, filename) {
        var fieldDefinition = fields[field] || {}
        var fieldIsArray = fieldDefinition[isArrayKey]
        var chunks = []

        if (fieldIsArray && !record.hasOwnProperty(field)) record[field] = []

        file.on('data', function (chunk) { chunks.push(chunk) })
        file.on('end', function () {
          var data = Buffer.concat(chunks)

          if (!data.length) return
          data.filename = filename

          if (fieldIsArray) {
            record[field].push(data)
            return
          }

          // If it gets to this point, it means there was already an attempt
          // to write the file.
          if (record.hasOwnProperty(field)) {
            reject(new BadRequestError(
              message('EnforceSingular', language, { key: field })))
            return
          }

          record[field] = data
        })
      })

      busboy.on('field', function (field, value) {
        var fieldDefinition = fields[field] || {}
        var fieldType = fieldDefinition[typeKey]
        var fieldIsArray = fieldDefinition[isArrayKey]
        var castOptions = assign(opts, options)
        var i

        try {
          if (fieldIsArray) {
            value = (value || '').split(',')
            for (i = value.length; i--;) {
              value[i] = value[i].trim()
              if (!value[i].length) {
                value.splice(i, 1)
                continue
              }
              value[i] = castValue(value[i], fieldType, castOptions)
            }

            if (Array.isArray(record[field]))
              record[field] = record[field].concat(value)
            else record[field] = value

            return
          }
          value = castValue(value, fieldType, castOptions)
        }
        catch (error) {
          reject(error)
          return
        }

        // If it gets to this point, it means there was already an attempt
        // to write the field.
        if (record.hasOwnProperty(field)) {
          reject(new BadRequestError(
            message('EnforceSingular', language, { key: field })))
          return
        }

        record[field] = value
      })

      busboy.on('finish', function () { resolve(record) })

      bufferStream.end(payload)
      bufferStream.pipe(busboy)
    })
  }
}


exports.formUrlEncoded = function (Serializer) {
  var SubClass = inherit(Serializer)
  SubClass.mediaType = 'application/x-www-form-urlencoded'
  return SubClass
}


exports.formData = function (Serializer) {
  var SubClass = inherit(Serializer)
  SubClass.mediaType = 'multipart/form-data'
  return SubClass
}
