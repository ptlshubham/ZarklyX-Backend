/**
 * AI Enrichment Worker
 * 
 * Issue: AI calls (Gemini) in main analysis flow add latency and risk
 * Solution: Separate AI enrichment as async background job
 * 
 * Flow:
 * 1. Main analysis completes → Saves data
 * 2. AI enrichment job queued
 * 3. Worker picks job → Calls AI → Updates records
 * 4. No blocking, no timeouts, better retry control
 * 
 * Benefits:
 * - Faster primary analysis (no AI wait)
 * - Better error handling (AI quota limits)
 * - Independent scaling (AI workers separate)
 * - Graceful degradation (analysis works without AI)
 */

import { Job, Queue, Worker } from 'bullmq';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================
// AI Enrichment Job Data Interfaces
// ============================================================

export interface AiEnrichmentJobData {
  sessionId: number;
  moduleType: 'tech-js' | 'keyword' | 'security' | 'lighthouse' | 'all-issues';
  rawData: any; // Analysis data to enrich
  companyId: number;
  userId: number;
}

export interface AiEnrichmentResult {
  sessionId: number;
  moduleType: string;
  recommendations: string[];
  summary: string;
  actionPlan: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  estimatedImpact: 'low' | 'medium' | 'high';
  priority: number; // 1-10
}

// ============================================================
// AI Service Wrapper (with retry logic)
// ============================================================

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private maxRetries: number = 3;
  private retryDelay: number = 2000;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not set. AI enrichment will be disabled.');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /**
   * Generate content with retry logic
   */
  async generateContent(prompt: string, retries: number = 0): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      // Handle quota errors
      if (error.message?.includes('quota') || error.message?.includes('429')) {
        console.error('❌ Gemini API quota exceeded');
        throw new Error('AI_QUOTA_EXCEEDED');
      }

      // Retry on transient errors
      if (retries < this.maxRetries) {
        console.warn(`⚠️ Gemini API error, retrying (${retries + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
        return this.generateContent(prompt, retries + 1);
      }

      throw error;
    }
  }
}

const geminiService = new GeminiService();

// ============================================================
// AI Enrichment Prompts
// ============================================================

const enrichmentPrompts = {
  'tech-js': (data: any) => `
You are an expert web developer and SEO consultant analyzing a website's technology stack.

Website Analysis Data:
${JSON.stringify(data, null, 2)}

Provide:
1. Technology recommendations (3-5 specific suggestions)
2. Executive summary (2-3 sentences)
3. Action plan (3-5 prioritized steps)
4. Estimated effort (low/medium/high)
5. Estimated impact (low/medium/high)
6. Priority score (1-10)

Format as JSON:
{
  "recommendations": [],
  "summary": "",
  "actionPlan": [],
  "estimatedEffort": "",
  "estimatedImpact": "",
  "priority": 0
}
`,

  'keyword': (data: any) => `
You are an SEO expert analyzing keyword analysis results.

Keyword Data:
${JSON.stringify(data, null, 2)}

Provide:
1. Keyword strategy recommendations
2. Content optimization suggestions
3. Ranking improvement action plan
4. Estimated effort and impact
5. Priority score

Format as JSON (same structure as above).
`,

  'security': (data: any) => `
You are a web security expert analyzing security vulnerabilities.

Security Analysis:
${JSON.stringify(data, null, 2)}

Provide:
1. Critical security recommendations
2. Risk summary
3. Remediation action plan (prioritized)
4. Estimated effort and impact
5. Priority score (security issues should have higher priority)

Format as JSON.
`,

  'lighthouse': (data: any) => `
You are a web performance expert analyzing Lighthouse results.

Performance Data:
${JSON.stringify(data, null, 2)}

Provide:
1. Performance optimization recommendations
2. Quick wins vs long-term improvements
3. Prioritized action plan
4. Estimated effort and impact
5. Priority score

Format as JSON.
`,

  'all-issues': (data: any) => `
You are a comprehensive SEO consultant reviewing all website issues.

All Issues:
${JSON.stringify(data, null, 2)}

Provide:
1. Top 5 critical recommendations
2. Executive summary of overall site health
3. Strategic action plan (prioritized)
4. Overall effort and impact
5. Priority score

Format as JSON.
`,
};

// ============================================================
// AI Enrichment Worker
// ============================================================

export async function createAiEnrichmentWorker(): Promise<Worker> {
  const worker = new Worker(
    'seo-ai-enrichment',
    async (job: Job<AiEnrichmentJobData>) => {
      console.log(`🤖 AI Enrichment started for session ${job.data.sessionId}`);
      
      try {
        await job.updateProgress(10);

        // Get appropriate prompt
        const promptFunction = enrichmentPrompts[job.data.moduleType];
        if (!promptFunction) {
          throw new Error(`Unknown module type: ${job.data.moduleType}`);
        }

        const prompt = promptFunction(job.data.rawData);
        await job.updateProgress(30);

        // Call Gemini API
        const aiResponse = await geminiService.generateContent(prompt);
        await job.updateProgress(70);

        // Parse AI response
        let enrichmentResult: AiEnrichmentResult;
        try {
          // Extract JSON from markdown code blocks if present
          const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || 
                           aiResponse.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : aiResponse;
          const parsed = JSON.parse(jsonStr);

          enrichmentResult = {
            sessionId: job.data.sessionId,
            moduleType: job.data.moduleType,
            recommendations: parsed.recommendations || [],
            summary: parsed.summary || '',
            actionPlan: parsed.actionPlan || [],
            estimatedEffort: parsed.estimatedEffort || 'medium',
            estimatedImpact: parsed.estimatedImpact || 'medium',
            priority: parsed.priority || 5,
          };
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
          // Fallback: use raw response
          enrichmentResult = {
            sessionId: job.data.sessionId,
            moduleType: job.data.moduleType,
            recommendations: [aiResponse.substring(0, 500)],
            summary: aiResponse.substring(0, 200),
            actionPlan: [],
            estimatedEffort: 'medium',
            estimatedImpact: 'medium',
            priority: 5,
          };
        }

        await job.updateProgress(90);

        // TODO: Save enrichment to database
        // await SeoAiEnrichment.create({
        //   session_id: enrichmentResult.sessionId,
        //   module_type: enrichmentResult.moduleType,
        //   recommendations: enrichmentResult.recommendations,
        //   summary: enrichmentResult.summary,
        //   action_plan: enrichmentResult.actionPlan,
        //   estimated_effort: enrichmentResult.estimatedEffort,
        //   estimated_impact: enrichmentResult.estimatedImpact,
        //   priority: enrichmentResult.priority,
        // });

        console.log(`✅ AI Enrichment completed for session ${job.data.sessionId}`);
        await job.updateProgress(100);

        return {
          success: true,
          sessionId: job.data.sessionId,
          result: enrichmentResult,
        };
      } catch (error: any) {
        console.error(`❌ AI Enrichment failed for session ${job.data.sessionId}:`, error.message);

        // Don't retry on quota errors
        if (error.message === 'AI_QUOTA_EXCEEDED') {
          return {
            success: false,
            error: 'AI quota exceeded',
            sessionId: job.data.sessionId,
          };
        }

        throw error; // Let BullMQ handle retries for other errors
      }
    },
    {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      concurrency: 3, // Process 3 AI enrichments concurrently
      removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
      removeOnFail: { count: 50 }, // Keep last 50 failed jobs
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`✅ AI enrichment job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`❌ AI enrichment job ${job?.id} failed:`, error.message);
  });

  return worker;
}

// ============================================================
// AI Enrichment Queue Service (for adding jobs)
// ============================================================

export class AiEnrichmentQueueService {
  private queue: Queue<AiEnrichmentJobData>;

  constructor() {
    this.queue = new Queue('seo-ai-enrichment', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
  }

  /**
   * Queue AI enrichment job
   */
  async queueEnrichment(data: AiEnrichmentJobData): Promise<Job<AiEnrichmentJobData> | null> {
    try {
      const job = await this.queue.add('enrich', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      console.log(`📤 AI enrichment queued for session ${data.sessionId} (job: ${job.id})`);
      return job;
    } catch (error) {
      console.error('Failed to queue AI enrichment:', error);
      return null;
    }
  }

  /**
   * Queue batch enrichments
   */
  async queueBatchEnrichments(dataArray: AiEnrichmentJobData[]): Promise<void> {
    const jobs = dataArray.map(data => ({
      name: 'enrich',
      data,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }));

    await this.queue.addBulk(jobs as any);
    console.log(`📤 ${dataArray.length} AI enrichment jobs queued`);
  }

  /**
   * Get queue stats
   */
  async getStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}

export const aiEnrichmentQueueService = new AiEnrichmentQueueService();
