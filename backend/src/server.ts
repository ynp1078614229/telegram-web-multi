import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import http from 'http';

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env') });

import db from './db/database';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import botRoutes from './routes/bot';
import telegramService from './services/telegramService';

const ADMIN_PORT = parseInt(process.env.MULTI_PORT || "3002");
const CLIENT_START_PORT = parseInt(process.env.CLIENT_START_PORT || '3001');

// ============ Main Admin Server (port 80) ============
const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/bot', botRoutes);

// Serve admin frontend
const adminDistPath = path.join(__dirname, '../../admin-frontend/dist');
app.use('/admin', express.static(adminDistPath));
app.use('/admin/assets', express.static(path.join(adminDistPath, 'assets')));

// SPA fallback for admin
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  const clients = telegramService.getAllClients();
  const accounts = db.prepare('SELECT id, first_name, username, is_active, client_port FROM accounts').all();
  res.json({ 
    status: 'ok', 
    connectedClients: clients.size,
    totalAccounts: accounts.length,
    accounts 
  });
});

// Account client status
app.get('/api/status', (req, res) => {
  const accounts = db.prepare(`
    SELECT id, telegram_user_id, phone, first_name, username, client_token, 
           is_active, client_port,
           CASE WHEN session_string IS NOT NULL AND telegram_user_id IS NOT NULL THEN 1 ELSE 0 END as is_logged_in
    FROM accounts ORDER BY id
  `).all();
  const clients = telegramService.getAllClients();
  const result = accounts.map((a: any) => ({
    ...a,
    isConnected: clients.has(a.id),
  }));
  res.json(result);
});

// Start main server
const server = http.createServer(app);
server.listen(ADMIN_PORT, '0.0.0.0', async () => {
  console.log(`[Admin] Server running on port ${ADMIN_PORT}`);
  console.log(`[Admin] Panel at http://0.0.0.0:${ADMIN_PORT}/admin`);
  
  // Initialize telegram clients
  try {
    await telegramService.initialize();
  } catch (e: any) {
    console.error('[TG] Init error:', e.message);
  }
});
