'use strict'

var qs = require('querystring')
var fs = require('fs')
var path = require('path')
var cookie = require('cookie')
var CleanCSS = require('clean-css')
var render = require('simulacra/render')

var cleaner = new CleanCSS({ level: 2 })

var stylesheet = cleaner.minify(fs.readFileSync(
  path.join(__dirname, 'page.css')).toString()).styles

var template = fs.readFileSync(
  path.join(__dirname, 'template.html')).toString()

var emDash = '—'
var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
}

var preamble = [
  '<!DOCTYPE html>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>' + stylesheet + '</style>'
].join('')

var binding = {
  name: [ '.side-title a', {
    text: setText,
    href: setHref
  } ],
  tokenStatus: '.token-status',
  breadcrumbs: [ '.breadcrumb', {
    text: setText,
    href: setHref
  } ],
  navigation: [ '.record-type', {
    type: [ '.type-header', { text: setText, href: setHref } ],
    fields: [ '.field', { text: setText, href: setHref } ]
  } ],
  documentation: [ '.documentation', {
    title: '.title',
    mediaTypesTitle: '.media-types-title',
    mediaTypes: '.media-type',
    nameTitle: '.name-title',
    typeTitle: '.type-title',
    descriptionTitle: '.description-title',
    definitions: [ '.definition', {
      go: [ 'div:first-of-type > a', setHref ],
      link: [ '.definition-link', {
        text: setText,
        href: setHref
      } ],
      name: '.definition-name',
      description: [ '.definition-description', {
        text: setText,
        isMissing: function (node, value) {
          node.classList[value ? 'add' : 'remove']('missing')
        }
      } ],
      tags: [ '.tag', {
        text: setText,
        type: function (node, value) { node.classList.add('tag-' + value) }
      } ]
    }, function (node, value) {
      node.setAttribute('id', value.name || value.link && value.link.text)
    } ]
  } ],
  query: [ 'form.side-query', {
    button: 'label.submit',
    queries: [ 'input.hidden-query', {
      value: setValue,
      name: setName
    } ],
    groups: [ '.query-group', {
      header: '.query-header',
      inputs: [ '.input-group', {
        title: '.input-title',
        input: [ 'input.input-field', {
          value: setValue,
          name: setName,
          placeholder: setPlaceholder
        } ]
      } ]
    } ]
  } ],
  records: [ '.records-container', {
    type: [ '.title', {
      text: setText,
      href: setHref
    } ],
    tagline: '.tagline',
    empty: '.empty-message',
    error: '.error-message',
    createLabel: 'label.label-create',
    toggleCreate: [ '.toggle-create', noop ],
    formOverlay: [ 'label.overlay.create', noop ],
    createForm: [ 'form.record-form.create', bindForm() ],
    message: [ '.message', {
      text: 'span',
      type: function (node, value) { node.classList.add(value) }
    } ],
    columns: [ '.column', {
      text: 'h4',
      options: [ 'a', {
        text: setText,
        href: setHref
      } ]
    } ],
    rows: [ '.row', {
      deleteRecord: [ 'form.delete-record', {
        csrf: [ 'input.csrf', {
          name: setName,
          value: setValue
        } ],
        action: setAction
      } ],
      values: [ '.value', {
        text: [ 'span', setText ],
        link: [ 'a', {
          text: setText,
          href: setHref
        } ],
        format: function (node, value) {
          if (value) node.classList.add(value)
        }
      } ],
      toggleUpdate: [ '.toggle-update', setId ],
      updateOverlay: [ 'label.overlay.update', setFor ],
      updateLabel: [ '.label-update', {
        for: setFor,
        text: setText
      } ],
      updateForm: [ 'form.record-form.update', bindForm() ]
    } ]
  } ]
}

var common, assign, methods, errors, keys, primaryKey, encodeRoute

// Do a warmup iteration.
render({}, binding, template)


module.exports = function (HttpSerializer) {
  /**
   * This is an ad hoc HTML serializer, which is suitable for humans.
   */
  function HtmlSerializer (properties) {
    var messages

    HttpSerializer.call(this, properties)
    encodeRoute = this.encodeRoute
    common = this.common
    assign = common.assign
    methods = common.methods
    errors = common.errors
    keys = common.keys
    primaryKey = keys.primary
    messages = this.message[this.message.defaultLanguage]
    messages['Index'] = 'Index'
    messages['MediaTypes'] = 'Media Types'
    messages['TokenAuthenticated'] = 'Authenticated'
    messages['Name'] = 'Name'
    messages['Description'] = 'Description'
    messages['Type'] = 'Type'
    messages['Field'] = 'Field'
    messages['Array'] = 'Array'
    messages['InputOnly'] = 'Input only'
    messages['Any'] = 'Any'
    messages['NoDescription'] = 'No description provided.'
    messages['CountItem'] = '1 item'
    messages['CountItems'] = '{count} items'
    messages['CountBytes'] = '{count} bytes'
    messages['Object'] = 'Object'
    messages['True'] = 'True'
    messages['False'] = 'False'
    messages['Null'] = 'Null'
    messages['Query'] = 'Query'
    messages['Pagination'] = 'Pagination'
    messages['Limit'] = 'Limit'
    messages['Offset'] = 'Offset'
    messages['MatchValue'] = 'Match value'
    messages['ShowIncompleteRecords'] = 'Showing {count} of {total} records'
    messages['ShowCompleteRecords'] = 'Showing {count} records'
    messages['Included'] = 'Included'
    messages['MessageCreate'] = 'Record has been created.'
    messages['MessageDelete'] = 'Record has been deleted.'
    messages['MessageUpdate'] = 'Record has been updated.'
    messages['NoRecords'] = 'No records matched the query.'
    messages['CreateRecord'] = 'Create {type}'
    messages['UpdateRecord'] = 'Edit'
  }

  HtmlSerializer.prototype = Object.create(HttpSerializer.prototype)


  HtmlSerializer.prototype.processResponse =
  function (contextResponse, request, response) {
    var type = request.meta.originalType || request.meta.type
    var method = request.meta.method
    var recordTypes = this.recordTypes
    var prefix = this.options.prefix || ''
    var injectHTML = this.options.injectHTML
    var uriBase64 = this.options.uriBase64
    var qsRegex = /\?(.*)/
    var content, location, hasQuery, parsedQuery

    // Redirect update/delete method to referer if possible.
    if ((method === methods.delete || method === methods.update) &&
      !(contextResponse instanceof Error)) {
      delete contextResponse.payload
      response.statusCode = 303
      location = 'referer' in request.headers ?
        request.headers['referer'] :
        prefix + encodeRoute(type, null, null, uriBase64)
      hasQuery = qsRegex.exec(location)
      parsedQuery = qs.parse(hasQuery ? hasQuery[1] : '')
      parsedQuery.message = method
      location = location.replace(qsRegex, '') +
        '?' + qs.stringify(parsedQuery)
      response.setHeader('Location', location)
      return
    }

    // Show records.
    if (contextResponse.payload)
      content = renderCollection
        .call(this, contextResponse, request)

    // Show the index.
    else if (contextResponse.isTypeUnspecified) {
      content = renderIndex.call(this, request)
      response.statusCode = 200
    }

    // Show an error.
    else content = type && type in recordTypes ?
      renderCollection.call(this, contextResponse, request) :
      showGenericError(contextResponse)

    contextResponse.payload = [
      preamble, injectHTML || '', content
    ].join('')
  }

  HtmlSerializer.prototype.parsePayload = function (contextRequest) {
    var method = contextRequest.method
    var language = contextRequest.meta.language
    var MethodError = errors.MethodError

    throw new MethodError(this.message(
      'InvalidMethod', language, { method: method }))
  }


  HtmlSerializer.mediaType = 'text/html'

  return HtmlSerializer
}


function processRecords (request, type, records) {
  var self = this

  // When given an error, it's assumed that there's no records.
  var isPrimary = records.isPrimary || records instanceof Error

  var method = request.meta.method
  var language = request.meta.language
  var query = request.meta.parsedUrl.query
  var prefix = self.options.prefix || ''
  var message = self.message
  var recordType = self.recordTypes[type]
  var uriBase64 = self.options.uriBase64
  var typeData = {
    text: type,
    href: prefix + encodeRoute(type, null, null, uriBase64)
  }
  var columns = {}
  var rows = []
  var column, record, field, row, text, link, format, count, value
  var queryClone, definition, updateId
  var i, j, k, l

  var createFields = {
    createLabel: isPrimary ?
      message('CreateRecord', language, { type: type }) : null,
    toggleCreate: isPrimary,
    formOverlay: isPrimary,
    createForm: isPrimary ? makeForm.call(this, request, type, null) : null
  }

  if (!records.length)
    if (records instanceof Error) return assign({
      type: typeData,
      error: records.message
    }, createFields)
    else return assign({
      type: typeData,
      empty: message('NoRecords', language)
    }, createFields)

  for (i = 0, j = records.length; i < j; i++)
    for (field in records[i]) {
      definition = recordType[field]
      if (definition && definition.inputOnly) continue
      columns[field] = true
    }

  // ID is a fixed column and is always first.
  delete columns[primaryKey]
  columns = [ primaryKey ].concat(Object.keys(columns))

  for (i = 0, j = columns.length; i < j; i++) {
    column = columns[i]
    columns[i] = {
      text: column,
      format: column in recordType ?
        (keys.type in recordType[column] &&
        (recordType[column].isArray ? 'array' :
          recordType[column].type.name.toLowerCase())) ||
          'link' : null,
      isArray: column in recordType && recordType[column].isArray,
      options: []
    }

    if (isPrimary && column in recordType) {
      queryClone = shallowClone(query)
      delete queryClone.message

      // Includeable column.
      if (keys.link in recordType[column]) {
        if (!Array.isArray(queryClone.include))
          queryClone.include = queryClone.include ?
            [ queryClone.include ] : []
        else queryClone.include = queryClone.include.slice()
        k = queryClone.include.indexOf(column)
        if (~k) {
          text = '−'
          queryClone.include.splice(k, 1)
          if (!queryClone.include.length)
            delete queryClone.include
        }
        else {
          text = '✚'
          queryClone.include.push(column)
        }
        columns[i].options.push({
          text: text,
          href: '?' + qs.stringify(queryClone)
        })
      }
      // Sortable column.
      else {
        queryClone.sort = column
        columns[i].options.push({
          text: '▲',
          href: '?' + qs.stringify(queryClone)
        })
        queryClone.sort = '-' + column
        columns[i].options.push({
          text: '▼',
          href: '?' + qs.stringify(queryClone)
        })
      }
    }
  }

  for (i = 0, j = records.length; i < j; i++) {
    record = records[i]
    updateId = 'toggle-' + type + '-' + record[primaryKey]
    row = {
      deleteRecord: {
        action: prefix +
          encodeRoute(type, record[primaryKey], null, uriBase64),
        csrf: request.csrf
      },
      values: [],
      toggleUpdate: updateId,
      updateOverlay: updateId,
      updateLabel: {
        for: updateId,
        text: message('UpdateRecord', language)
      },
      updateForm: makeForm.call(this, request, type, record)
    }
    rows.push(row)
    for (k = 0, l = columns.length; k < l; k++) {
      column = columns[k]
      field = column.text
      value = record[field]
      text = null
      link = null

      if (field in record && value !== null) {
        format = column.format ||
          (field === primaryKey ? 'id' : determineFormat(value))

        switch (format) {
        case 'array':
          count = value.length
          if (count === 0) {
            format = 'empty'
            text = emDash
            break
          }
          text = message(
            count === 1 ? 'CountItem' : 'CountItems',
            language, { count: count })
          break
        case 'date':
          text = value.toJSON()
          break
        case 'object':
          text = message('Object', language)
          break
        case 'boolean':
          text = message(value ? 'True' : 'False', language)
          break
        case 'buffer':
          count = Buffer.byteLength(value)
          format = 'buffer'
          text = message('CountBytes', language, { count: count })
          break
        case 'id':
          link = {
            text: '' + value,
            href: prefix + encodeRoute(type, value, null, uriBase64)
          }
          break
        case 'link':
          link = {
            href: prefix +
              encodeRoute(type, record[primaryKey], field, uriBase64)
          }
          if (column.isArray) {
            count = value.length
            if (count === 0) {
              link = null
              format = 'empty'
              text = emDash
              break
            }
            link.text = message(
              count === 1 ? 'CountItem' : 'CountItems',
              language, { count: count })
          }
          else link.text = '' + value
          break
        default:
          text = '' + value
        }
      }
      else {
        format = 'empty'
        text = emDash
      }

      row.values.push({
        text: text,
        link: link,
        format: format
      })
    }
  }

  return assign({
    type: typeData,
    tagline: isPrimary ?
      (!('count' in records) || records.length === records.count ?
        message('ShowCompleteRecords', language, {
          count: records.length
        }) :
        message('ShowIncompleteRecords', language, {
          count: records.length, total: records.count
        })) :
      message('Included', language),
    columns: columns,
    rows: rows,
    message: isPrimary && 'message' in query ?
      messageMap(message, language, query.message) :
      method === methods.create ?
        messageMap(message, language, methods.create) : null
  }, createFields)
}


function renderCollection (contextResponse, request) {
  var self = this
  var type = request.meta.originalType || request.meta.type
  var ids = request.meta.originalIds || request.meta.ids
  var recordType = self.recordTypes[request.meta.type]
  var relatedField = request.meta.relatedField
  var language = request.meta.language
  var settings = self.settings
  var message = self.message
  var documentation = self.documentation
  var prefix = self.options.prefix || ''
  var uriBase64 = self.options.uriBase64
  var title = type.charAt(0).toUpperCase() + type.slice(1) +
    (settings.name ? ' | ' + settings.name : '')
  var cookies = request.cookies = 'cookie' in request.headers ?
    cookie.parse(request.headers['cookie']) : {}
  var hasToken = 'token' in cookies

  var breadcrumbs = (function () {
    var list = [
      {
        text: message('Index', language),
        href: prefix + '/'
      },
      {
        text: type,
        href: prefix + encodeRoute(type, null, null, uriBase64)
      }
    ]

    if (ids) list.push({
      text: ids.join(', '),
      href: prefix + encodeRoute(type, ids, null, uriBase64)
    })

    if (relatedField) list.push({
      text: relatedField,
      href: prefix + encodeRoute(type, ids, relatedField, uriBase64)
    })

    return list
  }())

  var records = (function () {
    var list = []
    var includeType

    // This data object can only be re-used in server-side rendering.
    request.csrf = (function () {
      var list = []
      var key

      for (key in cookies)
        list.push({
          name: 'CSRF_' + key,
          value: cookies[key]
        })

      return list
    }())

    if (!contextResponse.payload) {
      list.push(processRecords
        .call(self, request, request.meta.type, contextResponse))
      return list
    }

    contextResponse.payload.records.isPrimary = true

    list.push(processRecords
      .call(self, request, request.meta.type,
        contextResponse.payload.records))

    if ('include' in contextResponse.payload)
      for (includeType in contextResponse.payload.include)
        list.push(processRecords
          .call(self, request, includeType,
            contextResponse.payload.include[includeType]))

    return list
  }())

  var query = (function () {
    var queryObject = request.meta.parsedUrl.query
    var options = request.meta.options
    var limitTitle = message('Limit', language)
    var offsetTitle = message('Offset', language)
    var groups = []
    var queries = []
    var inputs = []
    var key, matchField, values
    var i, j

    for (key in recordType) {
      if (documentation && key in documentation && !documentation[key])
        continue

      matchField = 'match.' + key
      inputs.push({
        title: key,
        input: {
          name: matchField,
          value: queryObject[matchField] || '',
          placeholder: keys.type in recordType[key] ?
            recordType[key].type.name : 'ID'
        }
      })
    }

    groups.push({
      header: message('MatchValue', language),
      inputs: inputs
    }, {
      header: message('Pagination', language),
      inputs: [ {
        title: limitTitle,
        input: {
          name: 'limit',
          value: options.limit || 0,
          placeholder: limitTitle
        }
      }, {
        title: offsetTitle,
        input: {
          name: 'offset',
          value: options.offset || 0,
          placeholder: offsetTitle
        }
      } ]
    })

    for (key in queryObject) {
      if (/^(?:offset|limit|match|message)/.test(key))
        continue

      values = Array.isArray(queryObject[key]) ?
        queryObject[key] : [ queryObject[key] ]

      for (i = 0, j = values.length; i < j; i++)
        queries.push({
          name: key,
          value: values[i]
        })
    }

    return {
      button: message('Query', language),
      queries: queries,
      groups: groups
    }
  }())

  var data = {
    name: {
      text: settings.name || emDash,
      href: prefix + '/'
    },
    tokenStatus: hasToken ?
      message('TokenAuthenticated', language) :
      null,
    breadcrumbs: breadcrumbs,
    query: query,
    records: records
  }

  return [
    '<title>' + escapeHTML(title) + '</title>',
    render(data, binding)
  ].join('')
}


function renderIndex (request) {
  var self = this
  var language = request.meta.language
  var cookies = 'cookie' in request.headers ?
    cookie.parse(request.headers['cookie']) : {}
  var hasToken = 'token' in cookies
  var prefix = self.options.prefix || ''
  var uriBase64 = self.options.uriBase64
  var settings = self.settings
  var message = self.message
  var recordTypes = self.recordTypes
  var documentation = self.documentation
  var title = message('Index', language) +
    (settings.name ? ' | ' + settings.name : '')

  var definitions = (function () {
    var keys = {}
    var field

    Object.keys(recordTypes).forEach(function (type) {
      var recordType = recordTypes[type]

      if (!(type in keys))
        keys[type] = {
          go: prefix + encodeRoute(type, null, null, uriBase64),
          link: {
            text: type,
            href: prefix + encodeRoute(type, null, null, uriBase64)
          },
          description: {
            text: message('NoDescription', language),
            isMissing: true
          },
          tags: [
            {
              text: message('Type', language),
              type: 'type'
            }
          ]
        }

      // Gather non-enumerable fields.
      Object.getOwnPropertyNames(recordType).forEach(function (field) {
        var definition = recordType[field]
        var isEnumerable = Object.getOwnPropertyDescriptor(
          recordType, field).enumerable
        var tagType, tags

        if (!isEnumerable && !definition.inputOnly) return

        if (!(field in keys)) {
          tagType = definition.type ? 'field' : 'link'
          tags = [
            {
              text: tagType === 'field' ?
                definition.type.name :
                definition.link,
              type: tagType
            }
          ]
          if (definition.isArray)
            tags.push({
              text: message('Array', language),
              type: 'array'
            })
          if (definition.inputOnly)
            tags.push({
              text: message('InputOnly', language),
              type: 'input-only'
            })
          keys[field] = {
            name: field,
            description: {
              text: message('NoDescription', language),
              isMissing: true
            },
            tags: tags
          }
        }
      })
    })

    if (documentation)
      for (field in documentation)
        if (!documentation[field]) delete keys[field]
        else {
          if (!(field in keys))
            keys[field] = {
              name: field,
              description: {},
              tags: [ { text: message('Any', language), type: 'any' } ]
            }
          keys[field].description.isMissing = false
          keys[field].description.text =
            typeof documentation[field] === 'object' ?
              documentation[field][language] ||
              documentation[field][message.defaultLanguage] :
              documentation[field]
        }

    return Object.keys(keys).sort().map(function (key) {
      return keys[key]
    })
  }())

  var navigation = (function () {
    return Object.keys(recordTypes).sort().map(function (type) {
      var recordType = recordTypes[type]
      var fields = Object.getOwnPropertyNames(recordType)
        .sort()
        .filter(function (field) {
          var definition = recordType[field]
          var isEnumerable = Object.getOwnPropertyDescriptor(
            recordType, field).enumerable
          var documentationOmitted = documentation &&
            field in documentation &&
            !documentation[field]

          return !documentationOmitted &&
            (isEnumerable || definition.inputOnly)
        })
        .map(function (field) {
          return {
            text: field,
            href: '#' + field
          }
        })

      return {
        type: {
          text: type,
          href: prefix + encodeRoute(type, null, null, uriBase64)
        },
        fields: fields
      }
    })
  }())

  var data = {
    name: {
      text: settings.name || emDash,
      href: prefix + '/'
    },
    tokenStatus: hasToken ?
      message('TokenAuthenticated', language) :
      null,
    breadcrumbs: [
      {
        text: message('Index', language),
        href: prefix + '/'
      }
    ],
    navigation: navigation,
    documentation: {
      title: message('Index', language),
      mediaTypesTitle: message('MediaTypes', language),
      mediaTypes: Object.keys(self.serializers),
      nameTitle: message('Name', language),
      typeTitle: message('Type', language),
      descriptionTitle: message('Description', language),
      definitions: definitions
    }
  }

  return [
    '<title>' + escapeHTML(title) + '</title>',
    render(data, binding)
  ].join('')
}


function escapeHTML (str) {
  if (typeof str !== 'string') return ''
  return str.replace(/[&<>"'`=\/]/g, function (x) {
    return entityMap[x]
  })
}


function determineFormat (value) {
  var type = typeof value
  if (Array.isArray(value)) return 'array'
  if (Buffer.isBuffer(value)) return 'buffer'
  if (value instanceof Date) return 'date'
  if (type === 'boolean') return 'boolean'
  if (type === 'object') return 'object'
  return null
}

function castToString (value, bufferEncoding) {
  var type = typeof value
  if (Buffer.isBuffer(value)) return value.toString(bufferEncoding)
  if (value instanceof Date) return value.toJSON()
  if (value === null || value === void 0) return ''
  if (type === 'boolean') return value ? 'true' : 'false'
  if (type === 'object') return JSON.stringify(value)
  return '' + value
}


function shallowClone (obj) {
  var clone = {}, key
  for (key in obj) clone[key] = obj[key]
  return clone
}


function messageMap (message, language, key) {
  switch (key) {
  case 'create': return {
    type: 'create',
    text: message('MessageCreate', language)
  }
  case 'update': return {
    type: 'update',
    text: message('MessageUpdate', language)
  }
  case 'delete': return {
    type: 'delete',
    text: message('MessageDelete', language)
  }
  default: return null
  }
}


function bindForm () {
  return {
    method: 'input.method',
    updateId: 'input.update-id',
    csrf: [ 'input.csrf', {
      name: setName,
      value: setValue
    } ],
    inputs: [ '.input-group', {
      title: '.input-title',
      textArea: [ 'textarea', {
        name: setName,
        value: setText,
        placeholder: setPlaceholder
      } ],
      boolean: [ '.radio-group', {
        trueLabel: 'label.true span',
        trueInput: [ 'label.true input', {
          name: setName,
          checked: setChecked
        } ],
        falseLabel: 'label.false span',
        falseInput: [ 'label.false input', {
          name: setName,
          checked: setChecked
        } ],
        nullLabel: 'label.null span',
        nullInput: [ 'label.null input', {
          name: setName,
          checked: setChecked
        } ]
      } ],
      textInput: [ 'input[type="text"]', {
        name: setName,
        type: setType,
        value: setValue,
        placeholder: setPlaceholder
      } ]
    } ],
    action: setAction,
    submit: 'label.submit-label span'
  }
}


function makeForm (request, type, record) {
  var language = request.meta.language
  var message = this.message
  var recordType = this.recordTypes[type]
  var prefix = this.options.prefix || ''
  var uriBase64 = this.options.uriBase64
  var bufferEncoding = this.options.bufferEncoding || 'base64'
  var inputs = []
  var fields, field, definition, isEnumerable, isArray, input
  var i, j, k, l, value, fieldType, inputType, matchPassword

  fields = Object.getOwnPropertyNames(recordType)

  for (i = 0, j = fields.length; i < j; i++) {
    field = fields[i]
    definition = recordType[field]
    fieldType = definition[keys.type]
    isArray = definition[keys.isArray]
    isEnumerable = Object
      .getOwnPropertyDescriptor(recordType, field).enumerable

    if ((!isEnumerable && !definition.inputOnly) ||
      definition.outputOnly) continue

    input = {
      title: field
    }

    if (record) {
      value = record[field]
      if (Array.isArray(value) && fieldType !== Object) {
        value = value.slice()
        for (k = 0, l = value.length; k < l; k++)
          value[k] = castToString(value[k], bufferEncoding)
        value = value.join(', ')
      }
      else value = castToString(value, bufferEncoding)
    }
    else value = ''

    matchPassword = (/password/i).test(field)

    if (fieldType === String && !matchPassword)
      input.textArea = {
        name: field,
        value: value,
        placeholder: definition[keys.type].name +
          (isArray ? ' (array)' : '')
      }
    else if (fieldType === Boolean)
      input.boolean = {
        name: field,
        trueLabel: message('True', language),
        falseLabel: message('False', language),
        nullLabel: message('Null', language),
        trueInput: {
          name: field,
          checked: value === 'true'
        },
        falseInput: {
          name: field,
          checked: value === 'false'
        },
        nullInput: {
          name: field,
          checked: value === ''
        }
      }
    else {
      inputType = 'text'
      if (fieldType === Date) inputType = 'datetime'
      if (fieldType === Number) inputType = 'number'

      // Special case for password inputs. It may be better to accept
      // a configuration option rather than checking the field name,
      // but this may be a safe assumption.
      if (matchPassword) inputType = 'password'

      input.textInput = {
        name: field,
        type: inputType,
        value: value,
        placeholder: (keys.type in definition ?
          definition[keys.type].name : 'ID') +
          (isArray ? ' (array)' : '')
      }
    }

    inputs.push(input)
  }

  return {
    updateId: record ? record[primaryKey] : null,
    method: record ? methods.update : methods.create,
    csrf: request.csrf,
    inputs: inputs,
    action: prefix + encodeRoute(type, null, null, uriBase64),
    submit: message(record ? 'UpdateRecord' : 'CreateRecord',
      language, { type: type })
  }
}


function showGenericError (contextResponse) {
  var name = contextResponse.name

  return [
    '<title>', name, '</title>',
    '<div class="generic-error"><div><h1>', name, '</h1><p>',
    contextResponse.message,
    '</p></div></div>'
  ].join('')
}


function setText (node, value) { node.textContent = value }
function setHref (node, value) { node.href = value }
function setValue (node, value) { node.value = value }
function setPlaceholder (node, value) { node.placeholder = value }
function setId (node, value) { node.id = value }
function setAction (node, value) { node.action = value }
function setChecked (node, value) { node.checked = value }
function setType (node, value) { node.setAttribute('type', value) }
function setName (node, value) { node.setAttribute('name', value) }
function setFor (node, value) { node.setAttribute('for', value) }
function noop () {}
