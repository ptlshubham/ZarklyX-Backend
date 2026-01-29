/* ===================== SHARED ANALYSIS TYPES ===================== */

export interface PaginationAnalysisOptions {
  maxPages?: number;
  followPagination?: boolean;
  timeout?: number;
  headless?: boolean;
}

export interface InternalSEOAnalysisOptions {
  maxDepth?: number;
  maxPages?: number;
  fast?: boolean;
  timeout?: number;
  headless?: boolean;
}

export interface SecurityAnalysisOptions {
  timeout?: number;
  headless?: boolean;
  includeAdvanced?: boolean;
}

export interface AnalysisError {
  success: false;
  error: string;
  processingTime: string;
  timestamp: string;
  code?: string;
}

export interface AnalysisSuccess<T> {
  success: true;
  url: string;
  timestamp: string;
  processingTime: string;
  data: T;
}

export type AnalysisResult<T> = AnalysisSuccess<T> | AnalysisError;

/* ===================== RISK LEVELS ===================== */

export const RISK_LEVELS = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export type RiskLevel = typeof RISK_LEVELS[keyof typeof RISK_LEVELS];

/* ===================== COMMON INTERFACES ===================== */

export interface RiskAssessment {
  overallRisk: RiskLevel;
  issues: string[];
  recommendations: string[];
}

export interface PerformanceMetrics {
  loadTimeMs: number;
  sizeKb: number;
  performance: 'fast' | 'moderate' | 'slow' | 'error';
}