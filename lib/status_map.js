'use strict'

module.exports = function (responses) {
  return new WeakMap([
    [ Error, 500 ],
    [ responses.UnsupportedError, 415 ],
    [ responses.ConflictError, 409 ],
    [ responses.NotAcceptableError, 406 ],
    [ responses.MethodError, 405 ],
    [ responses.NotFoundError, 404 ],
    [ responses.ForbiddenError, 403 ],
    [ responses.UnauthorizedError, 401 ],
    [ responses.BadRequestError, 400 ],
    [ responses.Empty, 204 ],
    [ responses.Created, 201 ],
    [ responses.OK, 200 ]
  ])
}
