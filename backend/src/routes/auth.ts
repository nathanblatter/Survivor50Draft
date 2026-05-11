import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fantasydraft-secret-key';

// Hash is generated at startup from ADMIN_PASSWORD env var
let adminPasswordHash: string;

export async function initAuth() {
  const password = process.env.ADMIN_PASSWORD || 'fantasydraft-admin';
  adminPasswordHash = await bcrypt.hash(password, 10);
}

router.post('/login', async (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  const valid = await bcrypt.compare(password, adminPasswordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ valid: false });
    return;
  }
  try {
    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false });
  }
});

export default router;
