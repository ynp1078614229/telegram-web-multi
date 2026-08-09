import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'telegram-multi-admin-secret-2026';

export interface AdminRequest extends Request {
  adminUser?: { id: number; username: string };
  account?: any;
}

export function adminAuth(req: AdminRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.adminUser = { id: decoded.id, username: decoded.username };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function accountAuth(req: AdminRequest, res: Response, next: NextFunction) {
  const token = req.headers['x-account-token'] as string || req.query.token as string;
  if (!token) return res.status(401).json({ error: 'No account token' });
  const db = require('../db/database').default;
  const account = db.prepare('SELECT * FROM accounts WHERE client_token = ? AND is_active = 1').get(token);
  if (!account) return res.status(401).json({ error: 'Invalid account token' });
  req.account = account;
  next();
}
