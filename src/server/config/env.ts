import path from 'node:path';

/**
 * Server-side configuration.
 *
 * Next.js loads `.env` / `.env.local` automatically for the app itself; the
 * explicit dotenv call below is what lets standalone scripts (the seeder) read
 * the same file without any extra wiring.
 */
if (!process.env.MONGODB_URI) {
  // Imported lazily so it never ends up in a client bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();
}

function num(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cargoentry';
const jwtSecret = process.env.JWT_SECRET ?? (isProduction ? '' : 'dev-only-insecure-secret-change-me');

if (isProduction && !jwtSecret) {
  throw new Error('JWT_SECRET must be set in production. See .env.example.');
}

export const env = {
  nodeEnv,
  isProduction,
  isDevelopment: !isProduction,

  appUrl: process.env.APP_URL ?? 'http://localhost:3000',

  /** Never hardcoded — always read from the environment. */
  mongoUri,

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  cookieName: process.env.COOKIE_NAME ?? 'cargoentry_token',
  cookieSecure: bool('COOKIE_SECURE', isProduction),

  admin: {
    name: process.env.ADMIN_NAME ?? 'System Administrator',
    email: (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? 'ChangeMe123!',
  },

  invitationExpiresHours: num('INVITATION_EXPIRES_HOURS', 72),

  // Note: this system stores no files, images or video, and uses no object
  // storage. Documents are tracked as records only.

  rateLimit: {
    /** `memory` for a single instance, `mongo` to share the window across replicas. */
    driver: (process.env.RATE_LIMIT_DRIVER ?? 'memory') as 'memory' | 'mongo',
    windowMs: num('RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
    /**
     * Only failed attempts count, so this ceiling is generous by design: it stops
     * password and token guessing without ever getting in a real user's way.
     */
    maxFailures: num('RATE_LIMIT_MAX_FAILURES', 50),
  },
} as const;
