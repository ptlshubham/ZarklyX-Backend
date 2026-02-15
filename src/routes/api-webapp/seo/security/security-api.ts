import { Router, Request, Response } from 'express';
import { analyzeSecurityHandler } from './security-analyze-handler';

const router = Router();

// Security handler already has its own error handling
router.post('/analyze-security', analyzeSecurityHandler);

export default router;