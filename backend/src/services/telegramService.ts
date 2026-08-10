import { NewMessage } from 'telegram/events';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { computeCheck } from 'telegram/Password';
import db from '../db/database';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';

const API_ID = parseInt(process.env.API_ID || '33960207');
const API_HASH = process.env.API_HASH || 'b4a1d5e99cce9e6f317596dfc25aa38a';

interface AccountClient {
  accountId: number;
  client: TelegramClient;
  userId?: number;
}

class TelegramService {
  private clients: Map<number, AccountClient> = new Map();
  private qrSessions: Map<string, { client: TelegramClient; accountId: number; token?: Buffer }> = new Map();
  private wss: any = null;

  setWss(wss: any) { this.wss = wss; }

  private convertUserId(rawId: any): number {
    if (typeof rawId === 'bigint') return Number(rawId);
    if (typeof rawId === 'number') return rawId;
    if (rawId?.toNumber) return rawId.toNumber();
    return parseInt(String(rawId));
  }

  private registerClient(accountId: number, client: TelegramClient, userId?: number) {
    this.clients.set(accountId, { accountId, client, userId });
  }

  async connectAccount(account: any): Promise<void> {
    try {
      const sessionObj = new StringSession(account.session_string || '');
      const client = new TelegramClient(sessionObj, API_ID, API_HASH, {
        connectionRetries: 3,
        useWSS: false,
      });
      await client.connect();
      let userId = account.telegram_user_id;
      if (!userId) {
        try {
          const me = await client.getMe();
          userId = this.convertUserId((me as any).id);
        } catch (e) { /* ignore */ }
      }
      this.registerClient(account.id, client, userId);
      // Setup message event handler for bot auto-reply
      await this.setupMessageHandler(client, account.id);
      console.log(`[Telegram] Account ${account.id} connected`);
    } catch (e: any) {
      console.error(`[Telegram] Failed to connect account ${account.id}:`, e.message);
    }
  }

  async connectAllAccounts(): Promise<void> {
    const accounts = db.prepare('SELECT * FROM accounts WHERE session_string IS NOT NULL AND is_active = 1').all() as any[];
    for (const account of accounts) {
      await this.connectAccount(account);
    }
  }

  getClient(accountId: number): TelegramClient | null {
    const ac = this.clients.get(accountId);
    return ac ? ac.client : null;
  }

  async startLogin(phone: string): Promise<{ phoneCodeHash: string; accountId: number }> {
    const accountId = db.prepare('INSERT INTO accounts (phone) VALUES (?)').run(phone).lastInsertRowid as number;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
    db.prepare('UPDATE accounts SET client_token = ?, client_port = ? WHERE id = ?').run(token, 0, accountId);
    const sessionObj = new StringSession('');
    const client = new TelegramClient(sessionObj, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
    });
    await client.connect();
    const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
    // Save session string so verifyCode can reuse the same session
    const sessionString = (client.session as any).save();
    db.prepare('UPDATE accounts SET session_string = ? WHERE id = ?').run(sessionString, accountId);
    db.prepare('INSERT INTO auth_sessions (phone, phone_code_hash, account_id) VALUES (?, ?, ?)')
      .run(phone, result.phoneCodeHash, accountId);
    return { phoneCodeHash: result.phoneCodeHash, accountId };
  }

  async verifyCode(phone: string, code: string, phoneCodeHash: string): Promise<{ success: boolean; accountId?: number; error?: string }> {
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
      const result = await client.invoke(new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      }));
      if ((result as any).className === 'auth.LoginToken' || (result as any).className === 'auth.LoginTokenMigrateTo') {
        return { success: false, error: '2FA_REQUIRED' };
      }
      const me = await client.getMe();
      const userId = this.convertUserId((me as any).id);
      const sessionString = (client.session as any).save();
      db.prepare(`UPDATE accounts SET telegram_user_id = ?, first_name = ?, username = ?, session_string = ?, is_active = 1 WHERE id = ?`)
        .run(userId, (me as any).firstName || '', (me as any).username || '', sessionString, account.id);
      db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(session.id);
      await this.connectAccount({ ...account, session_string: sessionString, telegram_user_id: userId });
      return { success: true, accountId: account.id };
    } catch (e: any) {
      if (e.message?.includes('SESSION_PASSWORD_NEEDED')) {
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
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const passwordResult = await computeCheck(passwordInfo as any, password);
      const result = await client.invoke(new Api.auth.CheckPassword({ password: passwordResult as any }));
      const me = await client.getMe();
      const userId = this.convertUserId((me as any).id);
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

  // QR Code Login
  async startQRLogin(): Promise<{ sessionId: string; qrUrl: string; qrSvg: string }> {
    const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    const accountId = db.prepare('INSERT INTO accounts (phone) VALUES (?)').run('qr_' + sessionId).lastInsertRowid as number;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
    db.prepare('UPDATE accounts SET client_token = ? WHERE id = ?').run(token, accountId);
    // Use WSS for QR login - needed to receive scan notifications
    const sessionObj = new StringSession('');
    const client = new TelegramClient(sessionObj, API_ID, API_HASH, {
      connectionRetries: 5,
      useWSS: true,
    });
    await client.connect();
    console.log('[QR] Client connected, exporting login token...');
    const result = await client.invoke(
      new Api.auth.ExportLoginToken({ apiId: API_ID, apiHash: API_HASH, exceptIds: [] })
    );
    console.log('[QR] ExportLoginToken result:', (result as any).className);
    let tokenBuf: Buffer;
    if (result instanceof Api.auth.LoginToken) {
      tokenBuf = (result as any).token;
    } else {
      tokenBuf = (result as any).token || Buffer.alloc(0);
    }
    const qrUrl = `tg://login?token=${tokenBuf.toString('base64url')}`;
    // Generate QR code using external API (more reliable than SVG)
    const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`;
    const qrSvg = `<div style="text-align:center"><img src="${qrImage}" alt="QR Code" style="width:200px;height:200px;border-radius:8px" /></div>`;
    this.qrSessions.set(sessionId, { client, accountId, token: tokenBuf });
    console.log('[QR] Session started, sessionId:', sessionId);
    return { sessionId, qrUrl, qrSvg };
  }

  async checkQRStatus(sessionId: string): Promise<{ status: string; accountId?: number; error?: string }> {
    const qrSession = this.qrSessions.get(sessionId);
    if (!qrSession) return { status: 'expired', error: 'Session expired' };
    try {
      const result = await qrSession.client.invoke(
        new Api.auth.ExportLoginToken({ apiId: API_ID, apiHash: API_HASH, exceptIds: [] })
      );
      console.log('[QR] Check result:', (result as any).className);

      if (result instanceof Api.auth.LoginTokenSuccess) {
        if (result.authorization instanceof Api.auth.Authorization) {
          console.log('[QR] Login success!');
          const me = await qrSession.client.getMe();
          const userId = this.convertUserId((me as any).id);
          const sessionString = (qrSession.client.session as any).save();
          const displayName = (me as any).username || String(userId);
            db.prepare(`UPDATE accounts SET telegram_user_id = ?, first_name = ?, username = ?, phone = ?, session_string = ?, is_active = 1 WHERE id = ?`)
            .run(userId, (me as any).firstName || '', (me as any).username || '', displayName, sessionString, qrSession.accountId);
          this.qrSessions.delete(sessionId);
          await this.connectAccount({ ...db.prepare('SELECT * FROM accounts WHERE id = ?').get(qrSession.accountId) as any, session_string: sessionString, telegram_user_id: userId });
          console.log('[QR] Account saved and connected, id:', qrSession.accountId);
          return { status: 'success', accountId: qrSession.accountId };
        }
        console.log('[QR] LoginTokenSuccess but unexpected auth type:', (result.authorization as any)?.className);
        return { status: 'error', error: 'Unexpected authorization type' };
      } else if (result instanceof Api.auth.LoginToken) {
        console.log('[QR] Still waiting for scan...');
        return { status: 'waiting' };
      } else if (result instanceof Api.auth.LoginTokenMigrateTo) {
        console.log('[QR] Needs DC migration to DC', (result as any).dcId);
        // Switch to the target DC
        await (qrSession.client as any)._switchDC((result as any).dcId);
        console.log('[QR] Switched DC, importing token...');
        const importResult = await qrSession.client.invoke(
          new Api.auth.ImportLoginToken({ token: (result as any).token })
        );
        console.log('[QR] ImportLoginToken result:', (importResult as any).className);
        if (importResult instanceof Api.auth.LoginTokenSuccess) {
          if (importResult.authorization instanceof Api.auth.Authorization) {
            console.log('[QR] Login success after DC migration!');
            const me = await qrSession.client.getMe();
            const userId = this.convertUserId((me as any).id);
            const sessionString = (qrSession.client.session as any).save();
            const displayName = (me as any).username || String(userId);
            db.prepare(`UPDATE accounts SET telegram_user_id = ?, first_name = ?, username = ?, phone = ?, session_string = ?, is_active = 1 WHERE id = ?`)
              .run(userId, (me as any).firstName || '', (me as any).username || '', displayName, sessionString, qrSession.accountId);
            this.qrSessions.delete(sessionId);
            await this.connectAccount({ ...db.prepare('SELECT * FROM accounts WHERE id = ?').get(qrSession.accountId) as any, session_string: sessionString, telegram_user_id: userId });
            return { status: 'success', accountId: qrSession.accountId };
          }
        }
        console.log('[QR] ImportLoginToken unexpected result');
        return { status: 'error', error: 'DC migration failed' };
      }
      console.log('[QR] Unexpected result type:', (result as any).className);
      return { status: 'waiting' };
    } catch (e: any) {
      console.log('[QR] Check error:', e.errorMessage || e.message);
      return { status: 'error', error: e.message };
    }
  }

  async getDialogs(accountId: number): Promise<any[]> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');
    const dialogs = await client.getDialogs({ limit: 50 });
    
    // Fetch last message for each dialog in parallel (batch of 10 to avoid rate limits)
    const results: any[] = [];
    const batchSize = 10;
    for (let i = 0; i < dialogs.length; i += batchSize) {
      const batch = dialogs.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (d: any) => {
        let lastMessage = d.lastMessage?.message || '';
        let lastMessageDate = d.lastMessage?.date || 0;
        let lastSenderName = '';
        let chatType = 'private';
        try {
          const entity = await client.getEntity(d.id);
          // Detect chat type from entity
          if (entity) {
            const e = entity as any;
            if (e.className === 'Channel') {
              chatType = e.broadcast ? 'channel' : 'supergroup';
            } else if (e.className === 'Chat') {
              chatType = 'group';
            }
          }
          const msgs = await client.getMessages(entity, { limit: 1 });
          if (msgs && msgs.length > 0) {
            const m = msgs[0] as any;
            lastMessage = m.message || '';
            lastMessageDate = m.date || 0;
            // Get sender name for group/supergroup chats
            if (chatType === 'group' || chatType === 'supergroup') {
              const senderId = m.senderId?.toString?.() || m.fromId?.userId?.toString?.() || '';
              if (senderId) {
                try {
                  const sender = await client.getEntity(senderId);
                  if (sender) {
                    const se = sender as any;
                    lastSenderName = se.title || [se.firstName, se.lastName].filter(Boolean).join(' ') || se.username || '';
                  }
                } catch (e) { /* ignore */ }
              }
            }
          }
        } catch (e) { /* ignore */ }

        return {
          id: d.id?.toString?.() || String(d.id),
          name: d.title || d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown',
          lastMessage,
          lastMessageDate,
          lastSenderName,
          unreadCount: d.unreadCount || 0,
          isGroup: d.isGroup || false,
          isChannel: d.isChannel || false,
          isUser: d.isUser || false,
          chatType,
        };
      }));
      results.push(...batchResults);
    }
    
    // Sort by lastMessageDate descending
    results.sort((a, b) => b.lastMessageDate - a.lastMessageDate);
    return results;
  }

  async markAsRead(accountId: number, chatId: string): Promise<boolean> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');
    try {
      const entity = await client.getEntity(chatId);
      const entityAny = entity as any;
      // Get latest message id for accurate max_id
      let maxId = 0;
      try {
        const msgs = await client.getMessages(entity, { limit: 1 });
        if (msgs && msgs.length > 0) maxId = (msgs[0] as any).id || 0;
      } catch (e) { /* fallback to 0 */ }
      // Channel / Supergroup → channels.ReadHistory; Private/Group → messages.ReadHistory
      if (entityAny?.className === 'Channel' || entityAny?.megagroup || entityAny?.broadcast) {
        await client.invoke(new Api.channels.ReadHistory({ channel: entity, maxId }));
      } else {
        await client.invoke(new Api.messages.ReadHistory({ peer: entity, maxId }));
      }
      return true;
    } catch (e) {
      console.error('[markAsRead] error for chatId=' + chatId, e);
      return false;
    }
  }

  async getMessages(accountId: number, chatId: string, limit: number = 50): Promise<any[]> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');
    const entity = await client.getEntity(chatId);
    const messages = await client.getMessages(entity, { limit });

    // Pre-fetch sender entities for name resolution
    const senderCache: Map<string, string> = new Map();
    const result: any[] = [];
    for (const m of messages) {
      const msg = m as any;
      let senderId: string | null = null;
      if (msg.senderId) {
        senderId = msg.senderId?.toString?.() || msg.fromId?.userId?.toString?.() || null;
      } else if (msg.fromId?.userId) {
        senderId = msg.fromId.userId.toString();
      }
      let senderName = msg.postAuthor || '';
      if (!senderName && senderId && !senderCache.has(senderId)) {
        try {
          const senderEntity = await client.getEntity(senderId);
          if (senderEntity) {
            const se = senderEntity as any;
            const name = se.title || [se.firstName, se.lastName].filter(Boolean).join(' ') || se.username || '';
            senderCache.set(senderId, name);
          } else {
            senderCache.set(senderId, '');
          }
        } catch (e) {
          senderCache.set(senderId, '');
        }
      }
      if (!senderName && senderId && senderCache.has(senderId)) {
        senderName = senderCache.get(senderId) || '';
      }
      result.push({
        id: msg.id,
        chatId: chatId,
        text: msg.message || '',
        date: msg.date,
        isOut: msg.out || false,
        senderId,
        senderName,
        replyToMsgId: msg.replyTo?.replyToMsgId || null,
        replyToSenderName: '',
        replyToText: '',
      });
    }
    return result;
  }

  async sendMessage(accountId: number, chatId: string, text: string, replyToMsgId?: number): Promise<any> {
    const client = this.getClient(accountId);
    if (!client) throw new Error('Account not connected');
    const entity = await client.getEntity(chatId);
    const result = await client.sendMessage(entity, { message: text, replyTo: replyToMsgId });
    return { id: (result as any).id, text, date: (result as any).date };
  }

  processTemplate(template: string, ctx: { name?: string; keyword?: string; senderId?: string; text?: string }): string {
    let r = template;
    r = r.replace(/\{name\}/g, ctx.name || ctx.senderId || 'friend');
    r = r.replace(/\{keyword\}/g, ctx.keyword || '');
    r = r.replace(/\{time\}/g, new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    r = r.replace(/\{date\}/g, new Date().toLocaleDateString('zh-CN'));
    r = r.replace(/\{weekday\}/g, ['周日','周一','周二','周三','周四','周五','周六'][new Date().getDay()]);
    r = r.replace(/\{input\}/g, ctx.text || '');
    r = r.replace(/\{random:([^}]+)\}/g, (_, opts) => {
      const arr = opts.split('|');
      return arr[Math.floor(Math.random() * arr.length)];
    });
    return r;
  }

  // Enhanced match with all match types
  private matchRuleFull(rule: any, inputText: string): boolean {
    const keywords = rule.keyword.split(/[,，]/).map((k: string) => k.trim().toLowerCase()).filter(Boolean);
    const text = inputText.toLowerCase();
    if (keywords.length === 0) return false;
    const matchMode = rule.match_mode || 'any';
    const matchFn = (kw: string) => {
      switch (rule.match_type) {
        case 'exact': return text === kw;
        case 'starts': return text.startsWith(kw);
        case 'ends': return text.endsWith(kw);
        case 'regex': try { return new RegExp(kw, 'i').test(text); } catch { return false; }
        case 'contains': default: return text.includes(kw);
      }
    };
    if (matchMode === 'all') return keywords.every(matchFn);
    return keywords.some(matchFn);
  }

  async handleIncomingMessage(accountId: number, chatId: string, msg: any): Promise<void> {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1').get(accountId) as any;
    if (!account) return;

    // Check global bot toggle (account_id=0)
    const globalBotRow = db.prepare("SELECT value FROM auth_state WHERE account_id = 0 AND key = 'bot_enabled'").get() as any;
    if (globalBotRow && Number(globalBotRow.value) !== 1) return;

    // Check per-account bot toggle
    const botRow = db.prepare("SELECT value FROM auth_state WHERE account_id = ? AND key = 'bot_enabled'").get(accountId) as any;
    if (botRow && Number(botRow.value) !== 1) return;

    // Load global rules (account_id=0) + account-specific rules
    const globalRules = db.prepare('SELECT * FROM auto_replies WHERE account_id = 0 AND is_active = 1 ORDER BY priority DESC').all() as any[];
    const accountRules = db.prepare('SELECT * FROM auto_replies WHERE account_id = ? AND is_active = 1 ORDER BY priority DESC').all(accountId) as any[];
    const rules = [...globalRules, ...accountRules];
    if (rules.length === 0) return;
    const text = msg.message || msg.text || '';
    if (!text) return;
    const senderId = msg.senderId?.toString?.() || msg.fromId?.userId?.toString?.() || '';

    // Try to get sender name for logging
    let senderName = '';
    if (senderId) {
      try {
        const client = this.getClient(accountId);
        if (client) {
          const senderEntity = await client.getEntity(senderId);
          if (senderEntity) {
            const se = senderEntity as any;
            senderName = se.title || [se.firstName, se.lastName].filter(Boolean).join(' ') || se.username || '';
          }
        }
      } catch (e) { /* ignore */ }
    }

    for (const rule of rules) {
      if (!rule.is_active) continue;
      if (!this.matchRuleFull(rule, text)) continue;

      // Scope check
      const scope = rule.scope || 'all';
      if (scope !== 'all') {
        // Determine chat type - for now treat all as 'all' compatible
        // scope: 'all' matches everything, 'private'/'group' need chat type detection
      }

      // Cooldown check
      const cooldown = db.prepare('SELECT * FROM auto_reply_cooldowns WHERE rule_id = ? AND chat_id = ?')
        .get(rule.id, chatId) as any;
      if (cooldown && rule.cooldown > 0) {
        const elapsed = (Date.now() - new Date(cooldown.last_triggered_at).getTime()) / 1000;
        if (elapsed < rule.cooldown) continue;
      }

      // Delay
      const dMin = rule.delay_min || 0;
      const dMax = rule.delay_max || 0;
      let delay = 0;
      if (dMax > dMin) delay = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin;
      else if (dMin > 0) delay = dMin;
      if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000));

      try {
        const client = this.getClient(accountId);
        if (!client) return;
        // Use msg.peerId directly to avoid entity resolution issues
        const replyText = this.processTemplate(rule.reply_text, { name: senderName, senderId, text, keyword: rule.keyword });
        await client.sendMessage(msg.peerId, { message: replyText });

        // Update match count
        db.prepare('UPDATE auto_replies SET match_count = match_count + 1 WHERE id = ?').run(rule.id);

        // Update cooldown
        if (rule.cooldown > 0) {
          db.prepare('INSERT OR REPLACE INTO auto_reply_cooldowns (rule_id, chat_id, last_triggered_at) VALUES (?, ?, datetime(now))')
            .run(rule.id, chatId);
        }

        // Record log
        try {
          db.prepare(`
            INSERT INTO auto_reply_logs (account_id, rule_id, from_user_id, from_user_name, keyword, reply_text, chat_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(accountId, rule.id, senderId, senderName, rule.keyword, replyText, 'chat');
        } catch (logErr) { /* ignore log errors */ }

        // WebSocket broadcast
        if (this.wss) {
          this.wss.clients.forEach((ws: any) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'bot_reply',
                accountId,
                chatId,
                ruleId: rule.id,
                reply: replyText,
              }));
            }
          });
        }
        console.log(`[Bot] Account ${accountId} rule ${rule.id} triggered: "${rule.keyword}" -> "${replyText}"`);
      } catch (e: any) {
        console.error('[Bot] Reply error:', e.message);
      }
      return; // Only match first (highest priority) rule
    }
  }

  async deleteAccount(accountId: number): Promise<void> {
    const ac = this.clients.get(accountId);
    if (ac) {
      try { await ac.client.destroy(); } catch (e) { /* ignore */ }
      this.clients.delete(accountId);
    }
    db.prepare('DELETE FROM auto_replies WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM auto_reply_cooldowns WHERE rule_id IN (SELECT id FROM auto_replies WHERE account_id = ?)').run(accountId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  }

  async disconnectAccount(accountId: number): Promise<void> {
    const ac = this.clients.get(accountId);
    if (ac) {
      try { await ac.client.destroy(); } catch (e) { /* ignore */ }
      this.clients.delete(accountId);
    }
  }

  setupWebSocket(wss: any) {
    this.wss = wss;
    wss.on('connection', (ws: any) => {
      ws.on('message', async (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe') {
            ws.accountId = msg.accountId;
          }
        } catch (e) { /* ignore */ }
      });
      ws.on('close', () => { ws.accountId = null; });
    });
  }

  broadcastMessage(accountId: number, chatId: string, message: any) {
    if (!this.wss) return;
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1 && (client.accountId === accountId || client.accountId === '*')) {
        client.send(JSON.stringify({
          type: 'new_message',
          accountId,
          chatId,
          message: {
            id: message.id,
            text: message.message || message.text || '',
            date: message.date,
            isOut: message.out || false,
            senderId: message.senderId?.toString?.() || null,
          }
        }));
      }
    });
  }

  async setupMessageHandler(client: TelegramClient, accountId: number) {
    client.addEventHandler(async (event: any) => {
      // When using NewMessage event builder, the callback receives a NewMessage event object
      // which has a .message property - NOT a className property
      const msg = event.message;
      if (!msg || msg.out) return; // Skip outgoing messages
      const chatId = msg.peerId?.channelId?.toString?.() || msg.peerId?.chatId?.toString?.() || msg.peerId?.userId?.toString?.() || '';
      if (chatId) {
        await this.handleIncomingMessage(accountId, chatId, msg);
        this.broadcastMessage(accountId, chatId, msg);
      }
    }, new NewMessage({}));
  }
  getAllClients(): Map<number, AccountClient> { return this.clients; }
  async initialize(): Promise<void> { await this.connectAllAccounts(); }
}

const telegramService = new TelegramService();
export default telegramService;
