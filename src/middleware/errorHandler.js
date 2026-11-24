import { HttpError } from '../utils/httpError.js';

export function apiNotFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'That address does not exist.' } });
}

// Every API error leaves the server in the same shape:
// { error: { code, message, fields?, details? } }
// Unexpected errors are logged in full and shown to the user as a plain message.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, fields: err.fields, details: err.details },
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_request', message: 'The request was not valid JSON.' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'That is too much data in one request.' } });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: { code: 'server_error', message: 'Something went wrong on the server. Try again in a moment.' },
  });
}
