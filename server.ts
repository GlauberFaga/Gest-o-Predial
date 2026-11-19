import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import {
  initializeApp,
  applicationDefault,
  cert,
  getApps,
  getApp,
} from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SsoJwtPayload {
  linkedEmail?: string;
  portalEmail?: string;
  exp?: number;
  [key: string]: unknown;
}

function loadDefaultProjectId(): string | undefined {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as { projectId?: string };
      return parsed.projectId;
    }
  } catch (err) {
    console.warn('Não foi possível ler firebase-applet-config.json:', err);
  }
  return undefined;
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return JSON.parse(decoded) as ServiceAccount;
    } catch (err) {
      console.error('FIREBASE_SERVICE_ACCOUNT_JSON inválido:', err);
      return null;
    }
  }
}

const serviceAccount = parseServiceAccount();
const defaultProjectId = loadDefaultProjectId();

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
      ...(defaultProjectId ? { projectId: defaultProjectId } : {}),
    });

function verifySsoJwt(token: string, secret: string): SsoJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token inválido');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    throw new Error('Token inválido');
  }

  let header: { alg?: string } | null = null;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
    };
  } catch {
    throw new Error('Token inválido');
  }

  if (header?.alg && header.alg !== 'HS256') {
    throw new Error('Algoritmo de assinatura inválido');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error('Assinatura inválida');
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8')
  ) as SsoJwtPayload;

  if (
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new Error('Token expirado');
  }

  return payload;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/sso/exchange', async (req: Request, res: Response) => {
    try {
      const rawToken = req.body?.ssoToken ?? req.body?.sso_token;
      const ssoToken = typeof rawToken === 'string' ? rawToken.trim() : '';
      if (!ssoToken) {
        res.status(400).json({ error: 'Token SSO não fornecido' });
        return;
      }

      const secret = process.env.SSO_SHARED_SECRET;
      if (!secret) {
        res.status(500).json({
          error: 'SSO_SHARED_SECRET não configurado no servidor',
        });
        return;
      }

      const payload = verifySsoJwt(ssoToken, secret);
      const targetEmail = String(payload.linkedEmail || payload.portalEmail || '')
        .trim()
        .toLowerCase();

      if (!targetEmail) {
        res.status(401).json({ error: 'E-mail ausente no token SSO' });
        return;
      }

      const adminAuth = getAuth(adminApp);
      const userRecord = await adminAuth.getUserByEmail(targetEmail);
      const customToken = await adminAuth.createCustomToken(userRecord.uid);

      res.json({ customToken });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na troca do token SSO';
      res.status(401).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Erro ao iniciar o servidor:', err);
  process.exit(1);
});
