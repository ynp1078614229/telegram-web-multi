import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import db from '../db/database';
import path from 'path';
import fs from 'fs';

const API_ID = parseInt(process.env.API_ID || '33960207');
const API_HASH = process.env.API_HASH || 'b4a1d5e99cce9e6f317596dfc25aa38a';

interface AccountClient {
  accountId: number;
  client: TelegramClient;
  userId?: number;
}

class TelegramService {
  private clients: Map<number, AccountClient> = new Map();
  private sessionsDir = path.join(__dirname, '../../sessions');

  constructor() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async initialize() {
    const accounts = db.prepare('SELECT * FROM accounts WHERE is_active = 1 AND session_string IS NOT NULL AND telegram_user_id IS NOT NULL').all() as any[];
    for (const acc of accounts) {
      try {
        await this.connectAccount(acc);
        console.log(`[TG] Connected account ${acc.id}: ${acc.first_name || acc.phone}`);
      } catch (e: any) {
        console.error(`[TG] Failed to connect account ${acc.id}: ${e.message}`);
      }
    }
    console.log(`[TG] ${this.clients.size}/${accounts.length} accounts connected`);
  }

  async connectAccount(account: any): Promise<TelegramClient> {
    const session = new StringSession(account.session_string || '');
    const client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
    });
    await client.connect();

    if (account.session_string && account.telegram_user_id) {
      try {
        const me = await client.getMe();
        const userId = (me as any).id?.toNumber?.() || (me as any).id;
        this.clients.set(account.id, { accountId: account.id, client, userId });
        this.setupMessageHandler(account.id, client);
      } catch (e: any) {
        console.error(`[TG] getMe failed for account ${account.id}: ${e.message}`);
      }
    } else if (account.session_string) {
      this.clients.set(account.id, { accountId: account.id, client });
      this.setupMessageHandler(account.id, client);
    }

    return client;
  }

  getClient(accountId: number): TelegramClient | null {
    return this.clients.get(accountId)?.client || null;
  }

  getAllClients(): Map<number, AccountClient> {
    return this.clients;
  }

  async startLogin(phone: string): Promise<{ phoneCodeHash: string; accountId: number; sessionString: string }> {
    const session = new StringSession('');
    const client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
    });
    await client.connect();

    const result = await client.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      phone
    );

    const sessionStr = (client.session as any).save();
    const port = this.getNextPort();
    const clientToken = this.generateToken();

    // Check if account already exists for this phone
    const existing = db.prepare('SELECT id FROM accounts WHERE phone = ? AND telegram_user_id IS NULL').get(phone) as any;
    let accountId: number;

    if (existing) {
      db.prepare('UPDATE accounts SET session_string = ?, client_token = COALESCE(client_token, ?), client_port = COALESCE(client_port, ?) WHERE id = ?')
        .run(sessionStr, clientToken, port, existing.id);
      accountId = existing.id;
    } else {
      const acc = db.prepare('INSERT INTO accounts (phone, session_string, client_token, client_port) VALUES (?, ?, ?, ?)')
        .run(phone, sessionStr, clientToken, port);
      accountId = acc.lastInsertRowid as number;
    }

    db.prepare('INSERT INTO auth_sessions (phone, phone_code_hash, account_id) VALUES (?, ?, ?)')
      .run(phone, result.phoneCodeHash, accountId);

    return { phoneCodeHash: result.phoneCodeHash, accountId, sessionString: sessionStr };
  }

  async verifyCode(phone: string, code: string, phoneCodeHash: string): Promise<{ success: boolean; accountId?: number; error?: string }> {
    const session = db.prepare('SELECT * FROM auth_sessions WHERE phone = ? AND phone_code_hash = ? ORDER BY id DESC LIMIT 1')
      .get(phone, phoneCodeHash) as any;
    if (!session) return { success: false, error: 'Session expired, please try again' };

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(session.account_id) as any;
    if (!account) return { success: false, error: 'Account not found' };

    try {
      const sessionObj = new StringSession(account.session_string || '');
      const client = new TelegramClient(sessionObj, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS: false,
      });
      await client.connect();

      await client.invoke(new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash: phoneCodeHash,
        phoneCode: code,
      }));

      const me = await client.getMe();
      const userId = (me as any).id?.toNumber?.() || (me as any).id;
      const sessionString = (client.session as any).save();

      db.prepare(`UPDATE accounts SET telegram_user_id = ?, first_name = ?, username = ?, session_string = ?, is_active = 1 WHERE id = ?`)
        .run(userId, (me as any).firstName || '', (me as any).username || '', sessionString, account.id);
      db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(session.id);

      await this.connectAccount({ ...account, session_string: sessionString, telegram_user_id: userId });

      return { success: true, accountId: account.id };
    } catch (e: any) {
      if (e.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        return { success: false, error: '2FA_REQUIRED' };
      }
      return { success: false, error: e.message };
    }
  }

  async verify2FA(phone: string, password: string, phoneCodeHash: string): Promise<{ success: boolean; accountId?: number; error?: string }> {
    const session = db.prepare('SELECT * FROM auth_sessions WHERE phone = ? AND phone_code_hash = ? ORDER BY id DESC LIMIT 1')
      .get(phone, phoneCodeHash) as any;
    if (!session) return { success: false, error: 'Session expired' };

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(session.account_id) as any;
    if (!account) return { success: false, error: 'Account not found' };

    try {
      const sessionObj = new StringSession(account.session_string || '');
      const client = new TelegramClient(sessionObj, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS: false,
      });
      await client.connect();

      await client.invoke(new Api.auth.CheckPassword({ password: await client.invoke(new Api.account.GetPassword()) as any } as any));
      // Use srp for 2FA
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const result = await (client as any).invoke(new Api.auth.CheckPassword({
        password: await (client as any).computePasswordSRP(passwordInfo, password)
      }));

      const me = await client.getMe();
      const userId = (me as any).id?.toNumber?.() || (me as any).id;
      const sessionString = (client.session as any).save();

      db.prepare(`UPDATE accounts SET telegram_user_id = ?, first_name = ?, username = ?, session_string = ?, is_active = 1 WHERE id = ?`)
        .run(userId, (me as any).firstName || '', (me as any).username || '', sessionString, account.id);
      db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(session.id);
      await this.connectAccount({ ...account, session_string: sessionString, telegram_user_id: userId });

      return { success: true, accountId: account.id };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async getDialogs(accountId: number): Promise<any[]> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');

    const dialogs = await client.getDialogs({ limit: 50 });
    return dialogs.map((d: any) => ({
      id: d.id?.toString?.() || String(d.id),
      name: d.title || d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown',
      lastMessage: d.lastMessage?.message || '',
      lastMessageDate: d.lastMessage?.date || 0,
      unreadCount: d.unreadCount || 0,
      isGroup: d.isGroup || false,
      isChannel: d.isChannel || false,
      isUser: d.isUser || false,
    }));
  }

  async getMessages(accountId: number, chatId: string, limit: number = 50): Promise<any[]> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');

    const entity = await client.getEntity(chatId);
    const messages = await client.getMessages(entity, { limit });

    return messages.map((m: any) => ({
      id: m.id,
      chatId: chatId,
      text: m.message || '',
      date: m.date,
      isOut: m.out || false,
      senderId: m.senderId?.toString?.() || m.fromId?.userId?.toString?.() || null,
      senderName: m.postAuthor || '',
      replyToMsgId: m.replyTo?.replyToMsgId || null,
      replyToSenderName: '',
      replyToText: '',
    }));
  }

  async sendMessage(accountId: number, chatId: string, text: string, replyToMsgId?: number): Promise<any> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');

    const entity = await client.getEntity(chatId);
    const result = await client.sendMessage(entity, { message: text, replyTo: replyToMsgId });
    return { id: result.id, text: result.message, date: result.date, isOut: true };
  }

  async disconnectAccount(accountId: number) {
    const ac = this.clients.get(accountId);
    if (ac) {
      try { await ac.client.disconnect(); } catch {}
      this.clients.delete(accountId);
    }
  }

  async deleteAccount(accountId: number) {
    await this.disconnectAccount(accountId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  }

  private getNextPort(): number {
    const startPort = parseInt(process.env.CLIENT_START_PORT || '3001');
    const maxPort = db.prepare('SELECT MAX(client_port) as maxPort FROM accounts').get() as any;
    return (maxPort?.maxPort || startPort - 1) + 1;
  }

  private generateToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
    return token;
  }

  private setupMessageHandler(accountId: number, client: TelegramClient) {
    (client as any).on('message', async (evt: any) => {
      try {
        const msg = evt.message || evt;
        if (msg.out || msg.outgoing) return;
        const text = msg.message;
        if (!text) return;

        const chatId = msg.chatId?.toString?.() || String(msg.chatId) || '';

        const rules = db.prepare('SELECT * FROM auto_replies WHERE account_id = ? AND is_active = 1 ORDER BY priority DESC')
          .all(accountId) as any[];
        if (rules.length === 0) return;

        const matchedRule = this.findMatchingRule(rules, text);
        if (!matchedRule) return;

        // Cooldown check
        if (matchedRule.cooldown > 0) {
          const cd = db.prepare('SELECT * FROM auto_reply_cooldowns WHERE rule_id = ? AND chat_id = ?')
            .get(matchedRule.id, chatId) as any;
          if (cd && (Date.now() - new Date(cd.last_triggered_at).getTime()) < matchedRule.cooldown * 1000) return;
        }

        const senderId = msg.senderId?.toString?.() || msg.fromId?.userId?.toString?.() || '';
        let replyText = this.processTemplate(matchedRule.reply_text, { senderId, text, keyword: matchedRule.keyword });

        const delay = matchedRule.delay_min + Math.random() * (matchedRule.delay_max - matchedRule.delay_min);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));

        const entity = await client.getEntity(chatId);
        await client.sendMessage(entity, { message: replyText });

        db.prepare('UPDATE auto_replies SET match_count = match_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(matchedRule.id);
        if (matchedRule.cooldown > 0) {
          db.prepare('INSERT OR REPLACE INTO auto_reply_cooldowns (rule_id, chat_id, last_triggered_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
            .run(matchedRule.id, chatId);
        }
        console.log(`[Bot][Account ${accountId}] Replied: ${text} -> ${replyText}`);
      } catch (e: any) {
        console.error(`[Bot][Account ${accountId}] Error: ${e.message}`);
      }
    });
  }

  private findMatchingRule(rules: any[], text: string): any | null {
    const maxPriority = Math.max(...rules.map(r => r.priority));
    const topRules = rules.filter(r => r.priority === maxPriority);
    for (const rule of topRules) {
      if (this.matchRule(rule, text)) return rule;
    }
    return null;
  }

  private matchRule(rule: any, text: string): boolean {
    if (rule.match_type === 'regex') {
      try { return new RegExp(rule.keyword, 'i').test(text); } catch { return false; }
    }
    const keywords = rule.keyword.split(/[,，]/).map((k: string) => k.trim()).filter(Boolean);
    if (rule.match_mode === 'all') return keywords.every((k: string) => text.toLowerCase().includes(k.toLowerCase()));
    return keywords.some((k: string) => text.toLowerCase().includes(k.toLowerCase()));
  }

  private processTemplate(template: string, ctx: any): string {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    let r = template;
    r = r.replace(/\{name\}/g, ctx.senderId || '');
    r = r.replace(/\{keyword\}/g, ctx.keyword || '');
    r = r.replace(/\{time\}/g, `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
    r = r.replace(/\{date\}/g, now.toISOString().split('T')[0]);
    r = r.replace(/\{weekday\}/g, `星期${weekdays[now.getDay()]}`);
    r = r.replace(/\{input\}/g, ctx.text || '');
    r = r.replace(/\{random:([^}]+)\}/g, (_: string, opts: string) => {
      const arr = opts.split('|');
      return arr[Math.floor(Math.random() * arr.length)];
    });
    return r;
  }
}

export const telegramService = new TelegramService();
export default telegramService;
