import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpHeaders } from '@angular/common/http';
import { TokenService } from '../services/token.service';

/**
 * Functional HTTP Interceptor to attach Authorization JWT token header to matching requests
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const token = tokenService.getToken();

  if (token) {
    const clonedRequest = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
    return next(clonedRequest);
  }

  return next(req);
};
