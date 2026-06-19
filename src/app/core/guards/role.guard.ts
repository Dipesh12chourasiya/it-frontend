import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Route Guard to ensure user has appropriate roles to access a route.
 * Expects allowed roles in route.data.roles as string array.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = route.data['roles'] as string[];
  const user = authService.currentUser();

  if (user && allowedRoles.includes(user.role)) {
    return true;
  }

  // Redirect to dashboard if unauthorized
  return router.createUrlTree(['/dashboard']);
};
