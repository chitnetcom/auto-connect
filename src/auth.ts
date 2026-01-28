import { Request, Response, NextFunction } from 'express';

// Session storage (in production, use Redis or database)
const sessions = new Map<string, { expiresAt: number }>();

const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

export function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function createSession(token: string): void {
  sessions.set(token, {
    expiresAt: Date.now() + SESSION_DURATION
  });
}

export function validateSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  
  // Check if session is expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  
  return true;
}

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for login endpoint
  if (req.path === '/api/login') {
    next();
    return;
  }
  
  // Skip auth for serving static files (except index.html which will handle auth)
  if (req.path.startsWith('/login.html') || req.path.startsWith('/style.css') || req.path.startsWith('/script.js')) {
    next();
    return;
  }
  
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !validateSession(token)) {
    // For API routes, return 401
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    // For page routes, redirect to login
    res.redirect('/login.html');
    return;
  }
  
  next();
}

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
