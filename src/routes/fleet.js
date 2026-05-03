import { Router } from 'express';
import { getFuelStatesByDeviceIds } from '../services/deviceFuelStore.js';

const router = Router();

router.get('/last-fuel', async (req, res, next) => {
  try {
    const queryValue = String(req.query.deviceIds || '');
    const deviceIds = queryValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const items = await getFuelStatesByDeviceIds(deviceIds);
    res.status(200).json({
      success: true,
      items,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

