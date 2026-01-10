import express from 'express';
import lighthouseRouter from './lighthouse/lighthouse-api';
import keywordRankingRouter from './keywordranking/keyword-ranking-api';
import responsiveRouter from './responsive/responsive-api';
import securityRouter from './security/security-api';
import siteRouter from './full-web-analyzer/site-api';
import techJsRouter from './tech-js/tech-js-api';
import paginationRouter from './pagination/pagination-api'
import internalSeoRouter from './internalseo/internal-seo-api';
import googleSearchConsoleRouter from './google-search-console/google-search-console-api';
import googleAnalyticsRouter from './google-analytics/google-analytics-api';
import googleServicesRouter from './google-service/google-services';
import seoDataRouter from './seo-data/seo-data-api'
const router = express.Router();

// Mount all SEO analysis routes
router.use('/lighthouse', lighthouseRouter);
router.use('/keyword-ranking', keywordRankingRouter);
router.use('/responsive', responsiveRouter);
router.use('/security', securityRouter);
router.use('/site', siteRouter);
router.use('/tech-js', techJsRouter);
router.use('/pagination', paginationRouter);
router.use('/internal-seo', internalSeoRouter);
router.use('/google-search-console', googleSearchConsoleRouter);
router.use('/google-analytics', googleAnalyticsRouter);
router.use('/google-services', googleServicesRouter);
//for interacting seo table 
router.use('/seo-data', seoDataRouter);



export default router;