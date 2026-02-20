import type { IRouter, Request, Response } from 'express';
import { Router } from 'express';

const router: IRouter = Router();
router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
export const healthRoutes = router;
