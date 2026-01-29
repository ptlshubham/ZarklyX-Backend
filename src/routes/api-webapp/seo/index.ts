import express from 'express';
import lighthouseRouter from './lighthouse/lighthouse-api';
import keywordRankingRouter from './keywordranking/keyword-ranking-api';
import accessibilityRouter from './accessibility/accessibility-api';
import securityRouter from './security/security-api';
import siteRouter from './full-web-analyzer/site-api';
import techJsRouter from './tech-js/tech-js-api';
import paginationRouter from './pagination/pagination-api'
import internalSeoRouter from './internalseo/internal-seo-api';
import googleSearchConsoleRouter from './google-search-console/google-search-console-api';
import googleAnalyticsRouter from './google-analytics/google-analytics-api';
import googleServicesRouter from './google-service/google-services';
import seoDataRouter from './seo-data/seo-data-api'
import dashboardRouter from './dashboard/seo-dashboard-api';
import recommendationsRouter from './recommendations/recommendations-api';
const router = express.Router();

// Mount all SEO analysis routes
router.use('/lighthouse', lighthouseRouter);
router.use('/keyword-ranking', keywordRankingRouter);
router.use('/accessibility', accessibilityRouter);
router.use('/security', securityRouter);
router.use('/site', siteRouter);
router.use('/tech-js', techJsRouter);
router.use('/pagination', paginationRouter);
router.use('/internal-seo', internalSeoRouter);
router.use('/google-search-console', googleSearchConsoleRouter);
router.use('/google-analytics', googleAnalyticsRouter);
router.use('/google-services', googleServicesRouter);
router.use('/seo-data', seoDataRouter);
router.use('/dashboard', dashboardRouter);
router.use('/recommendations', recommendationsRouter);



export default router;