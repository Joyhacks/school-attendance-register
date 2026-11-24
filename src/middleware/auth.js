import { forbidden, unauthorized } from '../utils/httpError.js';

// Loads the signed-in user on every request, so a deactivated account
// loses access straight away instead of when its cookie expires.
export function requireAuth(userService) {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) return next(unauthorized());
    const user = await userService.findActiveById(userId);
    if (!user) {
      req.session.destroy(() => {});
      return next(unauthorized('Your session has ended. Sign in again.'));
    }
    req.user = user;
    next();
  };
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) return next(forbidden());
    next();
  };
}

// Blocks cross-site form posts. A page on another website cannot add
// this header, and the login cookie is SameSite=Lax as a second guard.
export function requireAppHeader(req, res, next) {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (!safe && req.get('X-Requested-With') !== 'attendance-app') {
    return next(forbidden('Request blocked. Reload the page and try again.'));
  }
  next();
}
