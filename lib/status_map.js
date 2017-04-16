'use strict'

module.exports = function (hash) {
  var wm = new WeakMap()

  wm.set(Error, 500)
  if ('UnprocessableError' in hash) wm.set(hash.UnprocessableError, 422)
  if ('UnsupportedError' in hash) wm.set(hash.UnsupportedError, 415)
  if ('ConflictError' in hash) wm.set(hash.ConflictError, 409)
  if ('NotAcceptableError' in hash) wm.set(hash.NotAcceptableError, 406)
  if ('MethodError' in hash) wm.set(hash.MethodError, 405)
  if ('NotFoundError' in hash) wm.set(hash.NotFoundError, 404)
  if ('ForbiddenError' in hash) wm.set(hash.ForbiddenError, 403)
  if ('UnauthorizedError' in hash) wm.set(hash.UnauthorizedError, 401)
  if ('BadRequestError' in hash) wm.set(hash.BadRequestError, 400)
  if ('Empty' in hash) wm.set(hash.Empty, 204)
  if ('Created' in hash) wm.set(hash.Created, 201)
  if ('OK' in hash) wm.set(hash.OK, 200)

  return wm
}
