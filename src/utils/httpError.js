// An error the API is allowed to show to the user.
// status: HTTP status code. code: short machine-readable name.
// fields: optional { fieldName: message } map for form errors.
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = extra.fields;
    this.details = extra.details;
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'bad_request', message, extra);
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Record') => new HttpError(404, 'not_found', `${what} not found.`);
export const conflict = (message, extra) => new HttpError(409, 'conflict', message, extra);
export const invalid = (fields, message = 'Check the highlighted fields.') =>
  new HttpError(422, 'validation_error', message, { fields });
