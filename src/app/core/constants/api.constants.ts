export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register'
  },
  dashboard: {
    interview: (id: string) => `/dashboard/interview/${id}`,
    candidate: (id: string) => `/dashboard/candidate/${id}`,
  }
};
