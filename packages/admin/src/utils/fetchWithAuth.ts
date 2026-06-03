export const fetchWithAuth = (url: string | URL | Request, options: RequestInit = {}) => {
  const token = localStorage.getItem('chronicle_auth') || '';
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('x-chronicle-auth')) {
    headers.set('x-chronicle-auth', token);
  }
  return fetch(url, { ...options, headers });
};
