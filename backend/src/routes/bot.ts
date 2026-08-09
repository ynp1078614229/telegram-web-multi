import { Router, Response } from 'express';
import { adminAuth, AdminRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router();

// List rules for an account
router.get('/rules/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const rules = db.prepare('SELECT * FROM auto_replies WHERE account_id = ? ORDER BY priority DESC, id DESC')
    .all(req.params.accountId);
  res.json(rules);
});

// Create rule
router.post('/rules/:accountId', adminAuth, (req: AdminRequest, res: Response) => {
  const { keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active } = req.body;
  if (!keyword || !reply_text) return res.status(400).json({ error: 'keyword and reply_text required' });
  
  const result = db.prepare(`
    INSERT INTO auto_replies (account_id, keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(req.params.accountId),
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

// Update rule
router.put('/rules/:ruleId', adminAuth, (req: AdminRequest, res: Response) => {
  const { keyword, match_type, reply_text, priority, match_mode, delay_min, delay_max, cooldown, scope, is_active } = req.body;
  const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(req.params.ruleId) as any;
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

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

// Delete rule
router.delete('/rules/:ruleId', adminAuth, (req: AdminRequest, res: Response) => {
  db.prepare('DELETE FROM auto_replies WHERE id = ?').run(req.params.ruleId);
  res.json({ success: true });
});

// Copy rules from one account to another
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

export function matchRule(rule: any, text: string): boolean {
  if (rule.match_type === 'regex') {
    try { return new RegExp(rule.keyword, 'i').test(text); } catch { return false; }
  }
  const keywords = rule.keyword.split(/[,，]/).map((k: string) => k.trim()).filter(Boolean);
  if (rule.match_mode === 'all') return keywords.every((k: string) => text.toLowerCase().includes(k.toLowerCase()));
  return keywords.some((k: string) => text.toLowerCase().includes(k.toLowerCase()));
}

export function matchSingle(rule: any, text: string): boolean {
  return matchRule(rule, text);
}

export default router;
