/**
 * Centralized Score Engine Service
 * 
 * All SEO scoring logic passes through this engine.
 * Benefits:
 * - Single source of truth for scoring algorithms
 * - Easy weight adjustments
 * - A/B testing support
 * - Experimentation without code changes
 * - Audit trail of score calculations
 */

export interface ScoreWeight {
  category: string;
  metric: string;
  weight: number;
  minValue: number;
  maxValue: number;
}

export interface ScoreConfig {
  lighthouse: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa: number;
  };
  security: {
    headers: number;
    ssl: number;
    vulnerabilities: number;
    mixedContent: number;
  };
  techStack: {
    modernFrameworks: number;
    performance: number;
    seo: number;
  };
  responsive: {
    viewport: number;
    mediaQueries: number;
    touchTargets: number;
    fontScaling: number;
  };
  internalSEO: {
    linkStructure: number;
    orphanPages: number;
    brokenLinks: number;
    depthDistribution: number;
  };
}

export interface ScoreResult {
  overallScore: number; // 0-100
  categoryScores: Record<string, number>;
  breakdownByMetric: Record<string, number>;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  tier: 'excellent' | 'good' | 'average' | 'poor' | 'critical';
  confidence: number; // 0-1
  calculatedAt: Date;
  version: string; // Algorithm version for A/B testing
}

export interface RawMetrics {
  category: string;
  metrics: Record<string, number>;
}

/**
 * Centralized Score Engine
 * Singleton pattern for consistent scoring across all modules
 */
class ScoreEngineService {
  private currentVersion: string = '2.0';
  private defaultConfig: ScoreConfig;

  constructor() {
    this.defaultConfig = this.loadDefaultConfig();
  }

  /**
   * Load default scoring weights
   * Can be overridden from database/config file
   */
  private loadDefaultConfig(): ScoreConfig {
    return {
      lighthouse: {
        performance: 0.35,    // 35%
        accessibility: 0.20,  // 20%
        bestPractices: 0.15,  // 15%
        seo: 0.25,           // 25%
        pwa: 0.05,           // 5%
      },
      security: {
        headers: 0.40,        // 40%
        ssl: 0.30,           // 30%
        vulnerabilities: 0.25, // 25%
        mixedContent: 0.05,   // 5%
      },
      techStack: {
        modernFrameworks: 0.40, // 40%
        performance: 0.40,      // 40%
        seo: 0.20,             // 20%
      },
      responsive: {
        viewport: 0.30,       // 30%
        mediaQueries: 0.25,   // 25%
        touchTargets: 0.25,   // 25%
        fontScaling: 0.20,    // 20%
      },
      internalSEO: {
        linkStructure: 0.30,    // 30%
        orphanPages: 0.25,      // 25%
        brokenLinks: 0.30,      // 30%
        depthDistribution: 0.15, // 15%
      },
    };
  }

  /**
   * Calculate composite score from multiple raw metrics
   * 
   * @param rawMetrics - Array of category metrics
   * @param config - Optional custom config (for A/B testing)
   */
  calculateCompositeScore(
    rawMetrics: RawMetrics[],
    config?: Partial<ScoreConfig>
  ): ScoreResult {
    const appliedConfig = { ...this.defaultConfig, ...config };
    const categoryScores: Record<string, number> = {};
    const breakdownByMetric: Record<string, number> = {};

    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Calculate score for each category
    for (const category of rawMetrics) {
      const categoryConfig = appliedConfig[category.category as keyof ScoreConfig];
      
      if (!categoryConfig) {
        console.warn(`Unknown category: ${category.category}`);
        continue;
      }

      let categoryScore = 0;
      let categoryWeight = 0;

      // Calculate weighted average within category
      for (const [metric, value] of Object.entries(category.metrics)) {
        const weight = categoryConfig[metric as keyof typeof categoryConfig] || 0;
        const normalizedValue = this.normalizeValue(value, 0, 100);
        
        categoryScore += normalizedValue * weight;
        categoryWeight += weight;
        
        breakdownByMetric[`${category.category}.${metric}`] = normalizedValue;
      }

      // Normalize category score
      if (categoryWeight > 0) {
        categoryScore = categoryScore / categoryWeight;
      }

      categoryScores[category.category] = Math.round(categoryScore);
      totalWeightedScore += categoryScore;
      totalWeight += 1;
    }

    // Calculate overall score
    const overallScore = totalWeight > 0 
      ? Math.round(totalWeightedScore / totalWeight) 
      : 0;

    return {
      overallScore,
      categoryScores,
      breakdownByMetric,
      grade: this.scoreToGrade(overallScore),
      tier: this.scoreToTier(overallScore),
      confidence: this.calculateConfidence(rawMetrics),
      calculatedAt: new Date(),
      version: this.currentVersion,
    };
  }

  /**
   * Calculate single category score
   */
  calculateCategoryScore(
    category: string,
    metrics: Record<string, number>,
    config?: Partial<ScoreConfig>
  ): number {
    const appliedConfig = { ...this.defaultConfig, ...config };
    const categoryConfig = appliedConfig[category as keyof ScoreConfig];

    if (!categoryConfig) {
      throw new Error(`Unknown category: ${category}`);
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [metric, value] of Object.entries(metrics)) {
      const weight = categoryConfig[metric as keyof typeof categoryConfig] || 0;
      const normalizedValue = this.normalizeValue(value, 0, 100);
      
      weightedSum += normalizedValue * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Normalize value to 0-100 scale
   */
  private normalizeValue(value: number, min: number, max: number): number {
    if (value <= min) return 0;
    if (value >= max) return 100;
    return ((value - min) / (max - min)) * 100;
  }

  /**
   * Convert numeric score to letter grade
   */
  private scoreToGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 97) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Convert numeric score to tier
   */
  private scoreToTier(score: number): 'excellent' | 'good' | 'average' | 'poor' | 'critical' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'average';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  /**
   * Calculate confidence level based on data completeness
   */
  private calculateConfidence(rawMetrics: RawMetrics[]): number {
    if (rawMetrics.length === 0) return 0;

    let totalMetrics = 0;
    let nonZeroMetrics = 0;

    for (const category of rawMetrics) {
      const metricCount = Object.keys(category.metrics).length;
      totalMetrics += metricCount;
      
      nonZeroMetrics += Object.values(category.metrics)
        .filter(v => v !== null && v !== undefined && v !== 0)
        .length;
    }

    return totalMetrics > 0 ? nonZeroMetrics / totalMetrics : 0;
  }

  /**
   * Get current scoring version (for A/B testing)
   */
  getVersion(): string {
    return this.currentVersion;
  }

  /**
   * Update scoring version (for A/B testing)
   */
  setVersion(version: string): void {
    this.currentVersion = version;
  }

  /**
   * Get default configuration
   */
  getConfig(): ScoreConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Update scoring weights (for experimentation)
   */
  updateConfig(newConfig: Partial<ScoreConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...newConfig };
  }

  /**
   * Compare two score configurations (A/B testing)
   */
  compareConfigs(
    rawMetrics: RawMetrics[],
    configA: Partial<ScoreConfig>,
    configB: Partial<ScoreConfig>
  ): { scoreA: ScoreResult; scoreB: ScoreResult; difference: number } {
    const scoreA = this.calculateCompositeScore(rawMetrics, configA);
    const scoreB = this.calculateCompositeScore(rawMetrics, configB);
    const difference = scoreA.overallScore - scoreB.overallScore;

    return { scoreA, scoreB, difference };
  }
}

// Export singleton instance
const scoreEngineService = new ScoreEngineService();
export default scoreEngineService;
