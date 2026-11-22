// Starts the backend: connects to Postgres and Redis, creates the table, listens on port 3000.
const { Pool } = require('pg');
const { createClient } = require('redis');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

// Settings come from environment variables (ConfigMap + Secret in Kubernetes,
// "environment:" in compose.yaml)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || 'app',
  database: process.env.DB_NAME || 'app',
  max: 10,
});

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (err) => console.error('Redis error:', err.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The database may start after the backend, so keep retrying
async function initDatabase() {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notes (
          id SERIAL PRIMARY KEY,
          text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      console.log('Database ready');
      return;
    } catch (err) {
      console.log(`Database not ready (attempt ${attempt}): ${err.message}`);
      await sleep(3000);
    }
  }
  console.error('Gave up waiting for the database');
}

const app = createApp({
  pool,
  redis,
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '30', 10),
});

const server = app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));

// Connect in the background; the readiness probe keeps traffic away until both work
redis.connect().catch((err) => console.error('Redis connect failed:', err.message));
initDatabase();

// Graceful shutdown: Kubernetes sends SIGTERM before stopping a pod
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down');
  server.close();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
});
