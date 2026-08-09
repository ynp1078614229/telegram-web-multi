const API_BASE = '/api-multi';

function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: any = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
  
  getAccounts: () => request('/accounts'),
  addAccount: (phone: string) =>
    request('/accounts/login', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyCode: (phone: string, code: string, phoneCodeHash: string) =>
    request('/accounts/verify-code', { method: 'POST', body: JSON.stringify({ phone, code, phoneCodeHash }) }),
  verify2FA: (phone: string, password: string, phoneCodeHash: string) =>
    request('/accounts/verify-2fa', { method: 'POST', body: JSON.stringify({ phone, password, phoneCodeHash }) }),
  deleteAccount: (id: number) =>
    request(`/accounts/${id}`, { method: 'DELETE' }),
  toggleAccount: (id: number) =>
    request(`/accounts/${id}/toggle`, { method: 'PATCH' }),
  
  // QR Login
  startQRLogin: () => request('/accounts/qr/start', { method: 'POST' }),
  checkQRStatus: (sessionId: string) => request(`/accounts/qr/check/${sessionId}`),
  
  getDialogs: (accountId: number) => request(`/accounts/${accountId}/dialogs`),
  getMessages: (accountId: number, chatId: string, limit?: number) =>
    request(`/accounts/${accountId}/messages?chatId=${chatId}&limit=${limit || 50}`),
  sendMessage: (accountId: number, chatId: string, text: string, replyToMsgId?: number) =>
    request(`/accounts/${accountId}/send`, { method: 'POST', body: JSON.stringify({ chatId, text, replyToMsgId }) }),
  markAsRead: (accountId: number, chatId: string) =>
    request(`/accounts/${accountId}/mark-read`, { method: 'POST', body: JSON.stringify({ chatId }) }),
  
  // Bot rules
  getRules: (accountId: number) => request(`/bot/rules/${accountId}`),
  createRule: (accountId: number, data: any) =>
    request(`/bot/rules/${accountId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (ruleId: number, data: any) =>
    request(`/bot/rules/${ruleId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRule: (ruleId: number) =>
    request(`/bot/rules/${ruleId}`, { method: 'DELETE' }),
  copyRules: (fromId: number, toId: number) =>
    request(`/bot/copy-rules/${fromId}/${toId}`, { method: 'POST' }),
  
  // Bot status toggle
  getBotStatus: (accountId: number) => request(`/bot/status/${accountId}`),
  setBotStatus: (accountId: number, enabled: boolean) =>
    request(`/bot/status/${accountId}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
  
  // Bot logs
  getBotLogs: (accountId: number, limit?: number) => request(`/bot/logs/${accountId}?limit=${limit || 200}`),
  clearBotLogs: (accountId: number) => request(`/bot/logs/${accountId}`, { method: 'DELETE' }),
  
  // Bot test match
  testBotMatch: (accountId: number, text: string) =>
    request(`/bot/test/${accountId}`, { method: 'POST', body: JSON.stringify({ text }) }),
  
  getStatus: () => request('/status'),
  getHealth: () => request('/health'),
};
