import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { roleGuard } from './core/guards/role.guard';
import { DashboardLayout } from './core/layout/dashboard-layout/dashboard-layout';
import { AuthLayout } from './core/layout/auth-layout/auth-layout';
import { InterviewLayout } from './core/layout/interview-layout/interview-layout';

export const routes: Routes = [
  // Authenticated Dashboard Layout wrapper
  {
    path: '',
    component: DashboardLayout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/pages/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'interviews',
        canActivate: [roleGuard],
        data: { roles: ['recruiter'] },
        children: [
          {
            path: '',
            loadComponent: () => import('./features/recruiter/pages/interviews/interviews').then(m => m.Interviews)
          },
          {
            path: 'create',
            loadComponent: () => import('./features/recruiter/pages/create-interview/create-interview').then(m => m.CreateInterview)
          },
          {
            path: ':id',
            loadComponent: () => import('./features/recruiter/pages/interview-detail/interview-detail').then(m => m.InterviewDetail)
          }
        ]
      },
      {
        path: 'dashboard-monitor',
        canActivate: [roleGuard],
        data: { roles: ['recruiter'] },
        loadComponent: () => import('./features/recruiter/pages/recruiter-dashboard/recruiter-dashboard').then(m => m.RecruiterDashboard)
      },
      {
        path: 'live',
        canActivate: [roleGuard],
        data: { roles: ['recruiter'] },
        loadComponent: () => import('./features/recruiter/pages/live-activity/live-activity').then(m => m.LiveActivity)
      },
      {
        path: 'reports/:interviewId',
        canActivate: [roleGuard],
        data: { roles: ['recruiter'] },
        loadComponent: () => import('./features/reports/pages/report-detail/report-detail').then(m => m.ReportDetail)
      },
      {
        path: 'join',
        loadComponent: () => import('./features/candidate/pages/join/join').then(m => m.Join)
      }
    ]
  },
  // Unauthenticated Auth Layout wrapper
  {
    path: '',
    component: AuthLayout,
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/pages/login/login').then(m => m.Login)
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/pages/register/register').then(m => m.Register)
      }
    ]
  },
  // Immersive Interview Room Layout wrapper
  {
    path: 'interview-room',
    component: InterviewLayout,
    canActivate: [authGuard],
    children: [
      {
        path: ':interviewId',
        loadComponent: () => import('./features/interview-room/pages/interview-room/interview-room').then(m => m.InterviewRoom)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
