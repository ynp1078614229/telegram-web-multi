import { Router, Response } from 'express';
import { adminAuth, AdminRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router();

// ─── Match helpers (shared logic) ───
export function matchRule(rule: any, text: string): boolean {
  const keywords = rule.keyword.split(/[,，]/).map((k: string) => k.trim().toLowerCase()).filter(Boolean);
  const inputText = text.toLowerCase();
  if (keywords.length === 0) return false;
  const matchMode = rule.match_mode || 'any';
  if (matchMode === 'all') {
    return keywords.every((kw: string) => matchSingle(rule.match_type, inputText, kw));
  }
  return keywords.some((kw: string) => matchSingle(rule.match_type, inputText, kw));
}

function matchSingle(matchType: string, text: string, keyword: string): boolean {
  switch (matchType) {
    case 'exact': return text === keyword;
    case 'starts': return text.startsWith(keyword);
    case 'ends': return text.endsWith(keyword);
    case 'regex':
      try { return new RegExp(keyword, 'i').test(text); } catch { return false; }
    case 'contains':
    default: return text.includes(keyword);
  }
}

// ═══════════════════════════════════════════════════
// GLOBAL BOT MANAGEMENT (account_id = 0)
// ═══════════════════════════════════════════════════

// ─── Global bot toggle (account_id = 0) ───
router.get('/global/status', adminAuth, (_req: AdminRequest, res: Response) => {
  const row = db.prepare("SELECT value FROM auth_state WHERE account_id = 0 AND key = 'bot_enabled'").get() as any;
  const enabled = row ? Number(row.value) === 1 : true;
  res.json({ enabled });
});

router.put('/global/status', adminAuth, (req: AdminRequest, res: Response) => {
  const { enabled } = req.body;
  if (enabled === undefined) return res.status(400).json({ error: '缺少 enabled 参数' });
  const val = enabled ? 1 : 0;
  db.prepare("INSERT OR REPLACE INTO auth_state (account_id, key, value) VALUES (0, 'bot_enabled', ?)")
    .run(String(val));
  console.log(`[Bot] Global toggle: ${enabled ? 'ON' : 'OFF'}`);
  res.json({ enabled: !!enabled });
});

// ─── Global rules (account_id = 0) ───
router.get('/global/rules', adminAuth, (_req: AdminRequest, res: Response) => {
  const rules = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM auto_reply_logs WHERE rule_id = r.id) as total_matches
    FROM auto_replies r
    WHERE r.account_id = 0
    ORDER BY r.priority DESC, r.id DESC
  `).all();
  res.json(rules);
});

router.post('/global/rules', adminAuth, (req: AdminRequest, res: Response) => {
  const { keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active } = req.body;
  if (!keyword || !reply_text) return res.status(400).json({ error: '关键词和回复内容不能为空' });

  const result = db.prepare(`
    INSERT INTO auto_replies (account_id, keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active)
    VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    keyword,
    match_type || 'contains',
    reply_text,
    priority ?? 0,
    match_mode || 'any',
    delay_min ?? 0,
    delay_max ?? 1000,
    cooldown ?? 0,
    scope || 'all',
    is_active ?? 1
  );
  const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(result.lastInsertRowid);
  res.json(rule);
});

router.put('/rules/:ruleId', adminAuth, (req: AdminRequest, res: Response) => {
  const { keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active } = req.body;
  const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(req.params.ruleId) as any;
  if (!rule) return res.status(404).json({ error: '规则不存在' });

  db.prepare(`
    UPDATE auto_replies SET keyword=?, match_type=?, reply_text=?, priority=?, match_mode=?,
    delay_min=?, delay_max=?, cooldown=?, scope=?, is_active=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    keyword ?? rule.keyword,
    match_type ?? rule.match_type,
    reply_text ?? rule.reply_text,
    priority ?? rule.priority,
    match_mode ?? rule.match_mode,
    delay_min ?? rule.delay_min,
    delay_max ?? rule.delay_max,
    cooldown ?? rule.cooldown,
    scope ?? rule.scope,
    is_active ?? rule.is_active,
    req.params.ruleId
  );
  const updated = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(req.params.ruleId);
  res.json(updated);
});

router.delete('/rules/:ruleId', adminAuth, (req: AdminRequest, res: Response) => {
  db.prepare('DELETE FROM auto_reply_logs WHERE rule_id = ?').run(req.params.ruleId);
  db.prepare('DELETE FROM auto_reply_cooldowns WHERE rule_id = ?').run(req.params.ruleId);
  db.prepare('DELETE FROM auto_replies WHERE id = ?').run(req.params.ruleId);
  res.json({ success: true });
});

// ─── Global logs (all accounts) ───
router.get('/global/logs', adminAuth, (req: AdminRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
  const logs = db.prepare(`
    SELECT l.*, r.keyword as rule_keyword, a.phone as account_phone, a.first_name as account_name
    FROM auto_reply_logs l
    LEFT JOIN auto_replies r ON l.rule_id = r.id
    LEFT JOIN accounts a ON l.account_id = a.id
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(limit);
  res.json(logs);
});

router.delete('/global/logs', adminAuth, (_req: AdminRequest, res: Response) => {
  db.prepare('DELETE FROM auto_reply_logs').run();
  res.json({ success: true });
});

// ─── Global test match ───
router.post('/global/test', adminAuth, (req: AdminRequest, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '测试文本不能为空' });

  const rules = db.prepare('SELECT * FROM auto_replies WHERE account_id = 0 AND is_active = 1 ORDER BY priority DESC')
    .all() as any[];
  const matched: any[] = [];

  for (const rule of rules) {
    if (matchRule(rule, text)) {
      matched.push({
        id: rule.id,
        keyword: rule.keyword,
        reply_text: rule.reply_text,
        match_type: rule.match_type,
        delay_min: rule.delay_min,
        delay_max: rule.delay_max,
        cooldown: rule.cooldown,
        scope: rule.scope,
        priority: rule.priority,
        match_mode: rule.match_mode,
      });
    }
  }

  res.json({ matched, count: matched.length });
});

// ═══════════════════════════════════════════════════
// LEGACY per-account routes (kept for backward compatibility)
// ═══════════════════════════════════════════════════

router.get('/status/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const row = db.prepare("SELECT value FROM auth_state WHERE account_id = ? AND key = 'bot_enabled'")
    .get(parseInt(req.params.accountId)) as any;
  const enabled = row ? Number(row.value) === 1 : true;
  res.json({ enabled });
});

router.put('/status/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const { enabled } = req.body;
  if (enabled === undefined) return res.status(400).json({ error: '缺少 enabled 参数' });
  const accountId = parseInt(req.params.accountId);
  const val = enabled ? 1 : 0;
  db.prepare("INSERT OR REPLACE INTO auth_state (account_id, key, value) VALUES (?, 'bot_enabled', ?)")
    .run(accountId, String(val));
  console.log(`[Bot] Account ${accountId} toggle: ${enabled ? 'ON' : 'OFF'}`);
  res.json({ enabled: !!enabled });
});

router.get('/rules/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const rules = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM auto_reply_logs WHERE rule_id = r.id) as total_matches
    FROM auto_replies r
    WHERE r.account_id = ?
    ORDER BY r.priority DESC, r.id DESC
  `).all(parseInt(req.params.accountId));
  res.json(rules);
});

router.post('/rules/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const { keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active } = req.body;
  if (!keyword || !reply_text) return res.status(400).json({ error: '关键词和回复内容不能为空' });

  const result = db.prepare(`
    INSERT INTO auto_replies (account_id, keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(req.params.accountId),
    keyword, match_type || 'contains', reply_text,
    priority ?? 0, match_mode || 'any',
    delay_min ?? 0, delay_max ?? 1000,
    cooldown ?? 0, scope || 'all', is_active ?? 1
  );
  const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(result.lastInsertRowid);
  res.json(rule);
});

router.post('/copy-rules/:fromAccountId/:toAccountId', adminAuth, (req: AdminRequest, res: Response) => {
  const fromId = parseInt(req.params.fromAccountId);
  const toId = parseInt(req.params.toAccountId);
  const rules = db.prepare('SELECT * FROM auto_replies WHERE account_id = ?').all(fromId) as any[];
  const insert = db.prepare(`
    INSERT INTO auto_replies (account_id, keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let count = 0;
  for (const r of rules) {
    insert.run(toId, r.keyword, r.match_type, r.reply_text, r.priority, r.match_mode, r.delay_min, r.delay_max, r.cooldown, r.scope, r.is_active);
    count++;
  }
  res.json({ success: true, copied: count });
});

router.get('/logs/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
  const logs = db.prepare(`
    SELECT l.*, r.keyword as rule_keyword
    FROM auto_reply_logs l
    LEFT JOIN auto_replies r ON l.rule_id = r.id
    WHERE l.account_id = ?
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(parseInt(req.params.accountId), limit);
  res.json(logs);
});

router.delete('/logs/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  db.prepare('DELETE FROM auto_reply_logs WHERE account_id = ?').run(parseInt(req.params.accountId));
  res.json({ success: true });
});

router.post('/test/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '测试文本不能为空' });

  const rules = db.prepare('SELECT * FROM auto_replies WHERE account_id = ? AND is_active = 1 ORDER BY priority DESC')
    .all(parseInt(req.params.accountId)) as any[];
  const matched: any[] = [];

  for (const rule of rules) {
    if (matchRule(rule, text)) {
      matched.push({
        id: rule.id, keyword: rule.keyword, reply_text: rule.reply_text,
        match_type: rule.match_type, delay_min: rule.delay_min, delay_max: rule.delay_max,
        cooldown: rule.cooldown, scope: rule.scope, priority: rule.priority, match_mode: rule.match_mode,
      });
    }
  }

  res.json({ matched, count: matched.length });
});

export default router;
