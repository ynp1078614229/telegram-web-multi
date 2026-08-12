import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database';
import { adminAuth, AdminRequest } from '../middleware/auth';

const router: Router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'telegram-multi-admin-secret-2026';

// Admin login
router.post('/login', (req: any, res: Response) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

// Verify token
router.get('/me', adminAuth, (req: AdminRequest, res: Response) => {
  res.json({ user: req.adminUser });
});

// Change password
router.post('/change-password', adminAuth, (req: AdminRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.adminUser!.id) as any;
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Wrong old password' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ success: true });
});

export default router;
