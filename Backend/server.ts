import express from 'express';
import path from 'path';
import { tradingRoutes } from './routes/trading-routes';
import { configRoutes } from './routes/config-routes';
import {
  startSupervisor,
  stopSupervisor,
  requestAgentRestart,
  allowDebugEndpoints
} from './services/supervisorController';

export function createApp(options: { serveFrontend: boolean; frontendDistPath?: string }) {
  const app = express();
  app.use(express.json());

  // Supervisor POST routes on app level so they always match (avoids 404 from router)
  app.post('/api/trading/live/supervisor/start', async (req, res) => {
    if (!allowDebugEndpoints(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const result = await startSupervisor();
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Failed to start supervisor' });
    }
  });
  app.post('/api/trading/live/supervisor/stop', async (req, res) => {
    if (!allowDebugEndpoints(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      await stopSupervisor();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to stop supervisor' });
    }
  });
  app.post('/api/trading/live/supervisor/restart/:agentId', async (req, res) => {
    if (!allowDebugEndpoints(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      await requestAgentRestart(req.params.agentId);
      res.json({ ok: true, agentId: req.params.agentId });
    } catch (e) {
      res.status(500).json({ error: 'Failed to request agent restart' });
    }
  });

  app.use('/api/trading/live', tradingRoutes);
  app.use('/api', configRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // So we can see if a request reached Express but no route matched
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found', path: req.path, method: req.method });
  });

  if (options.serveFrontend && options.frontendDistPath) {
    app.use(express.static(options.frontendDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(options.frontendDistPath!, 'index.html'));
    });
  }

  return app;
}
