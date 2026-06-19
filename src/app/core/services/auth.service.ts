import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../constants/api.constants';
import { AuthResponse, User } from '../models/auth.model';
import { LoginRequest } from '../models/login-request.model';
import { RegisterRequest } from '../models/register-request.model';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);
  private readonly apiUrl = environment.apiUrl;

  // Signal to store current user details
  readonly currentUser = signal<User | null>(this.getStoredUser());

  /**
   * Register a new user
   * @param request Registration fields
   */
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiUrl}${API_ENDPOINTS.auth.register}`,
      request
    ).pipe(
      tap((response: AuthResponse) => {
        if (response && response.token) {
          this.tokenService.setToken(response.token);
          this.setStoredUser(response.user);
        }
      })
    );
  }

  /**
   * Log in an existing user
   * @param request Login credentials
   */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiUrl}${API_ENDPOINTS.auth.login}`,
      request
    ).pipe(
      tap((response: AuthResponse) => {
        if (response && response.token) {
          this.tokenService.setToken(response.token);
          this.setStoredUser(response.user);
        }
      })
    );
  }

  /**
   * Log out current user by clearing stored token and user data
   */
  logout(): void {
    this.tokenService.removeToken();
    localStorage.removeItem('user');
    this.currentUser.set(null);
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated(): boolean {
    return this.tokenService.hasToken() && this.currentUser() !== null;
  }

  private getStoredUser(): User | null {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private setStoredUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUser.set(user);
  }
}