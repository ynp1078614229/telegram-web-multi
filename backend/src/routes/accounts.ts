import { Router, Response } from 'express';
import { adminAuth, AdminRequest } from '../middleware/auth';
import db from '../db/database';
import telegramService from '../services/telegramService';

const router = Router();

// List all accounts
router.get('/', adminAuth, (req: AdminRequest, res: Response) => {
  const accounts = db.prepare(`
    SELECT id, telegram_user_id, phone, first_name, username, client_token, 
           is_active, client_port, created_at, last_seen_at,
           CASE WHEN session_string IS NOT NULL AND telegram_user_id IS NOT NULL THEN 1 ELSE 0 END as is_logged_in
    FROM accounts ORDER BY id DESC
  `).all();
  res.json(accounts);
});

// Add new account (start login)
router.post('/login', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    const result = await telegramService.startLogin(phone);
    res.json({ phoneCodeHash: result.phoneCodeHash, accountId: result.accountId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Verify code
router.post('/verify-code', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    const { phone, code, phoneCodeHash } = req.body;
    const result = await telegramService.verifyCode(phone, code, phoneCodeHash);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Verify 2FA
router.post('/verify-2fa', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    const { phone, password, phoneCodeHash } = req.body;
    const result = await telegramService.verify2FA(phone, password, phoneCodeHash);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get account detail
router.get('/:id', adminAuth, (req: AdminRequest, res: Response) => {
  const account = db.prepare('SELECT id, telegram_user_id, phone, first_name, username, client_token, is_active, client_port FROM accounts WHERE id = ?')
    .get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });
  res.json(account);
});

// Toggle active
router.patch('/:id/toggle', adminAuth, (req: AdminRequest, res: Response) => {
  const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!acc) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE accounts SET is_active = ? WHERE id = ?').run(acc.is_active ? 0 : 1, acc.id);
  res.json({ success: true, is_active: !acc.is_active });
});

// Delete account
router.delete('/:id', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    await telegramService.deleteAccount(parseInt(req.params.id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get dialogs (chats list) for account
router.get('/:id/dialogs', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    const dialogs = await telegramService.getDialogs(parseInt(req.params.id));
    res.json(dialogs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get messages for account + chat
router.get('/:id/messages', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    const { chatId, limit } = req.query;
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    const messages = await telegramService.getMessages(parseInt(req.params.id), chatId as string, parseInt(limit as string) || 50);
    res.json(messages);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Send message for account
router.post('/:id/send', adminAuth, async (req: AdminRequest, res: Response) => {
  try {
    const { chatId, text, replyToMsgId } = req.body;
    if (!chatId || !text) return res.status(400).json({ error: 'chatId and text required' });
    const result = await telegramService.sendMessage(parseInt(req.params.id), chatId, text, replyToMsgId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Regenerate client token
router.post('/:id/regen-token', adminAuth, (req: AdminRequest, res: Response) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  db.prepare('UPDATE accounts SET client_token = ? WHERE id = ?').run(token, req.params.id);
  res.json({ client_token: token });
});

export default router;
