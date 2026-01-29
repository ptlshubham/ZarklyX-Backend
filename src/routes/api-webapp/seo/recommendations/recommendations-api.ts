import { Router, Request, Response } from 'express';
import { generateRecommendationsHandler } from './recommendations-handler';
import { serverError } from '../../../../utils/responseHandler';
import { promises } from 'dns';

const router = Router();

router.post('/generate-recommendations', async (req: Request, res: Response): Promise<any> => {
  try {
    return generateRecommendationsHandler(req, res);
  } catch (error: any) {
    serverError(res, error.message || 'Recommendations API failed');
  }
});

export default router;