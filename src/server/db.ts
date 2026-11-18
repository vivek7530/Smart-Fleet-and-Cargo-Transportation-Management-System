import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './config/env';
import { logger } from './lib/logger';

// The MongoDB driver uses dns.promises internally for SRV lookups, which
// maintains a separate server list from the callback-based dns API.
// Set Google DNS on BOTH so SRV resolution works even if the system DNS
// does not support SRV queries.
const DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];
dns.setServers(DNS_SERVERS);
dns.promises.setServers(DNS_SERVERS);

mongoose.set('strictQuery', true);

/**
 * Next.js reloads server modules on every edit in development, which would
 * otherwise open a new pool each time. The connection is cached on `globalThis`
 * so exactly one pool survives hot reloads.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __cargoentryMongoose: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis.__cargoentryMongoose ?? { conn: null, promise: null };
globalThis.__cargoentryMongoose = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.mongoUri, {
        serverSelectionTimeoutMS: 10_000,
        // Index creation is convenient in development and cheap here; disable it
        // in production once the indexes have been built.
        autoIndex: !env.isProduction,
        maxPoolSize: 10,
      })
      .then((connection) => {
        logger.success(`MongoDB connected → ${redact(env.mongoUri)}`);
        return connection;
      })
      .catch((error) => {
        // Clear the cached promise so the next request can retry.
        cache.promise = null;
        logger.error('MongoDB connection failed', error);
        throw error;
      });
  }

  const connection = await cache.promise;
  cache.conn = connection;
  return connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.conn) {
    await cache.conn.connection.close();
    cache.conn = null;
    cache.promise = null;
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function redact(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}
