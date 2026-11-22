// The Express API. It receives its database (pool) and cache (redis) from outside,
// so tests can pass in fake versions without a real Postgres or Redis.
const express = require('express');
const client = require('prom-client');

const CACHE_KEY = 'notes:all';

function createApp({ pool, redis, cacheTtlSeconds = 30 }) {
  const app = express();
  app.use(express.json());

  // ---------- Prometheus metrics ----------
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequests = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });

  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [register],
  });

  const cacheRequests = new client.Counter({
    name: 'cache_requests_total',
    help: 'Cache lookups for the notes list, by result (hit or miss)',
    labelNames: ['result'],
    registers: [register],
  });

  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const route = req.route ? req.route.path : 'unknown';
      const labels = { method: req.method, route, status: res.statusCode };
      httpRequests.inc(labels);
      end(labels);
    });
    next();
  });

  // ---------- Health checks ----------
  // Liveness: is the Node process alive? It deliberately does NOT check the
  // database: if Postgres is down, restarting the backend would not fix it.
  app.get('/api/health', (req, res) => res.status(200).send('ok'));

  // Readiness: can this pod do useful work right now? Checks Postgres and Redis.
  // If either is down, Kubernetes stops sending traffic to this pod (no restart).
  app.get('/api/ready', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      await redis.ping();
      res.status(200).send('ready');
    } catch (err) {
      res.status(503).send(`not ready: ${err.message}`);
    }
  });

  // ---------- App info ----------
  app.get('/api/info', (req, res) => {
    res.json({
      service: 'backend',
      version: process.env.APP_VERSION || 'dev',
      pod: process.env.HOSTNAME || 'local', // in Kubernetes, HOSTNAME = pod name
    });
  });

  // ---------- Notes (cache-aside pattern) ----------
  // 1. Look in Redis first. 2. On a miss, read Postgres and save the result in Redis.
  app.get('/api/notes', async (req, res) => {
    try {
      let cached = null;
      try {
        cached = await redis.get(CACHE_KEY);
      } catch (err) {
        console.error('Cache read failed, falling back to database:', err.message);
      }

      if (cached) {
        cacheRequests.inc({ result: 'hit' });
        return res.json({ source: 'cache', notes: JSON.parse(cached) });
      }

      cacheRequests.inc({ result: 'miss' });
      const { rows } = await pool.query(
        'SELECT id, text, created_at FROM notes ORDER BY id DESC LIMIT 50'
      );

      try {
        await redis.set(CACHE_KEY, JSON.stringify(rows), { EX: cacheTtlSeconds });
      } catch (err) {
        console.error('Cache write failed:', err.message);
      }

      res.json({ source: 'database', notes: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not load notes' });
    }
  });

  app.post('/api/notes', async (req, res) => {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (text.length < 1 || text.length > 200) {
      return res.status(400).json({ error: 'text must be 1 to 200 characters' });
    }
    try {
      const { rows } = await pool.query(
        'INSERT INTO notes (text) VALUES ($1) RETURNING id, text, created_at',
        [text]
      );
      // The cached list is now out of date, so delete it
      try {
        await redis.del(CACHE_KEY);
      } catch (err) {
        console.error('Cache delete failed:', err.message);
      }
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not save note' });
    }
  });

  // Burns CPU for ?ms=200 milliseconds (max 2000) so you can trigger autoscaling
  app.get('/api/work', (req, res) => {
    const ms = Math.min(parseInt(req.query.ms, 10) || 200, 2000);
    const until = Date.now() + ms;
    let x = 0;
    while (Date.now() < until) x += Math.sqrt(Math.random());
    res.json({ burnedMs: ms });
  });

  // ---------- Metrics for Prometheus (not exposed through the frontend) ----------
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  return app;
}

module.exports = { createApp, CACHE_KEY };
