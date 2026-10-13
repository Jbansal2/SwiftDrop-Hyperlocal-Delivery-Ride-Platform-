export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

export const notFound = (message = 'Not found') => new HttpError(404, message)
export const forbidden = (message = 'Forbidden') => new HttpError(403, message)
export const badRequest = (message = 'Bad request') => new HttpError(400, message)
export const conflict = (message = 'Conflict') => new HttpError(409, message)
