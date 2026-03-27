import { Router } from 'express';
import { buildOverview } from '../services/overviewService';

export const overviewRoutes = Router();

overviewRoutes.get('/overview', async (_req, res) => {
  try {
    const payload = await buildOverview();
    res.set('Cache-Control', 'private, max-age=5');
    res.json(payload);
  } catch {
    res.status(500).json({ error: 'Failed to build overview' });
  }
});
