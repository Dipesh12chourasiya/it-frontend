import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { TokenService } from '../services/token.service';

/**
 * Public endpoints that must NEVER carry an Authorization header.
 *
 * These routes are unauthenticated by design — attaching a stale or
 * missing token causes the backend to either reject the request or
 * behave unpredictably (e.g. CORS pre-flight failures when the
 * browser sends a credentialed request to an endpoint that doesn't
 * expect one).
 */
const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register'];

/**
 * Returns `true` when the request URL matches a public endpoint
 * that must not receive a Bearer token.
 */
function isPublicEndpoint(url: string): boolean {
  return PUBLIC_ENDPOINTS.some((ep) => url.includes(ep));
}

/**
 * Functional HTTP interceptor that attaches a JWT Bearer token to
 * every outgoing request **except** public authentication endpoints.
 *
 * Registered globally via `provideHttpClient(withInterceptors([authInterceptor]))`
 * in `app.config.ts`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // ── Skip token for public auth routes ───────────────────────────────
  // Login and register requests must arrive without an Authorization
  // header. A stale token from a previous session would otherwise be
  // forwarded, which can confuse the backend or trigger unexpected
  // CORS pre-flight behaviour on Render.
  if (isPublicEndpoint(req.url)) {
    return next(req);
  }

  const tokenService = inject(TokenService);
  const token = tokenService.getToken();

  if (token) {
    const clonedRequest = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
    return next(clonedRequest);
  }

  return next(req);
};
