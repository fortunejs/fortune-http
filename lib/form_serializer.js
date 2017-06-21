'use strict'

var Busboy = require('busboy')
var stream = require('stream')


function inherit (HttpSerializer) {
  var common, assign, castToNumber, message, methods, errors, keys, castValue
  var initializeContext, attachQueries

  function FormSerializer (properties) {
    HttpSerializer.call(this, properties)
    common = this.common
    assign = common.assign
    castToNumber = common.castToNumber
    message = common.message
    methods = common.methods
    errors = common.errors
    keys = common.keys
    castValue = common.castValue
    initializeContext = this.initializeContext
    attachQueries = initializeContext.attachQueries
  }

  FormSerializer.prototype = Object.create(HttpSerializer.prototype)


  FormSerializer.prototype.processRequest = function (contextRequest) {
    throw new errors.UnsupportedError(
      message('InputOnly', contextRequest.meta.language))
  }


  FormSerializer.prototype.parsePayload = function (contextRequest, request) {
    var self = this
    var BadRequestError = errors.BadRequestError
    var primaryKey = keys.primary
    var language = contextRequest.meta.language

    return this.parse(contextRequest)

      .then(function (records) {
        var record = records[0]
        var method = contextRequest.method
        var id

        if ('method' in record) {
          method = contextRequest.method = request.meta.method = record.method
          delete record.method
        }

        if (method === methods.find)
          attachQueries.call(self, contextRequest, records[0])

        else if (method === methods.create) return records

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


  FormSerializer.prototype.parse = function (contextRequest) {
    var BadRequestError = errors.BadRequestError
    var language = contextRequest.meta.language
    var headers = contextRequest.meta.headers
    var payload = contextRequest.payload
    var type = contextRequest.type
    var recordTypes = this.recordTypes
    var opts = { language: contextRequest.meta.language }
    var options = this.options
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

        if (fieldIsArray && !record.hasOwnProperty(field)) record[field] = []

        try {
          value = castValue(value, fieldType, assign(opts, options))
        }
        catch (error) {
          reject(error)
          return
        }

        if (fieldIsArray) {
          if (value != null) record[field].push(value)
          return
        }

        if (record.hasOwnProperty(field)) {
          reject(new BadRequestError(
            message('EnforceSingular', language, { key: field })))
          return
        }

        record[field] = value
      })

      busboy.on('finish', function () { resolve([ record ]) })

      bufferStream.end(payload)
      bufferStream.pipe(busboy)
    })
  }


  return FormSerializer
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
