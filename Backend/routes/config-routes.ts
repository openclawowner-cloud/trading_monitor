import { Router } from 'express';
import { getKillSwitch } from '../utils/config';
import { getVersionInfo } from '../utils/versionInfo';
import { STALE_THRESHOLD_MINUTES } from '../utils/config';

export const configRoutes = Router();

configRoutes.get('/config', (_req, res) => {
  const killSwitch = getKillSwitch();
  res.json({
    killSwitchMode: killSwitch.mode,
    killSwitchActive: killSwitch.active,
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
    wsEnabled: false,
    ...getVersionInfo()
  });
});
