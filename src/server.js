import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import alertsRouter from './routes/alerts.js';
import rulesRouter from './routes/rules.js';
import authRouter from './routes/auth.js';
import { connectDatabase } from './db.js';
import { startTraccarPolling } from './services/traccarPollingService.js';

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  })
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'backend-vehicle',
    env: config.env,
  });
});

app.use('/api/alerts', alertsRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/auth', authRouter);

app.use((error, _req, res, _next) => {
  res.status(500).json({
    success: false,
    error: error?.message || 'Unexpected server error',
  });
});

connectDatabase()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[backend-vehicle] running on http://localhost:${config.port}`);
      startTraccarPolling();
    });
  })
  .catch((error) => {
    console.error('[backend-vehicle] failed to start', error?.message || error);
    process.exit(1);
  });
