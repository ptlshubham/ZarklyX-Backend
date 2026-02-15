/**
 * Normalized Database Schema for SEO System
 * 
 * Issue: Storing everything in JSON blobs makes analytics impossible
 * Solution: Split into normalized, queryable tables
 * 
 * New Architecture:
 * - seo_audit_sessions: High-level audit record
 * - seo_module_scores: Scores per module (queryable trends)
 * - seo_issues: Individual issues (filterable, aggregatable)
 * - seo_pages: Pages analyzed (for multi-page audits)
 * - seo_raw_data: JSON dump (for full detail when needed)
 * 
 * Benefits:
 * - Query trends: "Show me performance scores over time"
 * - Aggregate issues: "Top 10 security issues across all sites"
 * - Compare sites: "How does Site A vs Site B on accessibility?"
 * - Generate reports: "Monthly improvement dashboard"
 */

import { DataTypes, Model, Sequelize } from 'sequelize';

// ============================================================
// 1. SEO AUDIT SESSIONS (Top-level audit record)
// ============================================================

export class SeoAuditSession extends Model {
  public id!: number;
  public url!: string;
  public company_id!: number;
  public user_id!: number;
  
  // Metadata
  public audit_type!: 'full' | 'lighthouse' | 'security' | 'technical' | 'content';
  public status!: 'pending' | 'running' | 'completed' | 'failed';
  public started_at!: Date;
  public completed_at!: Date | null;
  public duration_ms!: number | null;
  
  // Overall scoring
  public overall_score!: number; // 0-100
  public grade!: string; // A+, A, B, C, D, F
  public tier!: string; // excellent, good, average, poor, critical
  public confidence!: number; // 0-1
  
  // Counts
  public total_issues!: number;
  public critical_issues!: number;
  public high_issues!: number;
  public medium_issues!: number;
  public low_issues!: number;
  
  // Environment
  public device_type!: string; // desktop, mobile, tablet
  public user_agent!: string | null;
  
  // Job tracking
  public job_id!: string | null;
  public queue_name!: string | null;
  
  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public deleted_at!: Date | null;
}

export function initSeoAuditSession(sequelize: Sequelize): typeof SeoAuditSession {
  SeoAuditSession.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      url: {
        type: DataTypes.STRING(2048),
        allowNull: false,
        validate: {
          isUrl: true,
        },
      },
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'companies',
          key: 'id',
        },
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      audit_type: {
        type: DataTypes.ENUM('full', 'lighthouse', 'security', 'technical', 'content'),
        allowNull: false,
        defaultValue: 'full',
      },
      status: {
        type: DataTypes.ENUM('pending', 'running', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      overall_score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        validate: {
          min: 0,
          max: 100,
        },
      },
      grade: {
        type: DataTypes.STRING(2),
        allowNull: true,
      },
      tier: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true,
        validate: {
          min: 0,
          max: 1,
        },
      },
      total_issues: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      critical_issues: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      high_issues: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      medium_issues: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      low_issues: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      device_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'desktop',
      },
      user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      job_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      queue_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'seo_audit_sessions',
      timestamps: true,
      underscored: true,
      paranoid: true, // Soft deletes
      indexes: [
        { fields: ['url'] },
        { fields: ['company_id', 'created_at'] },
        { fields: ['user_id', 'created_at'] },
        { fields: ['status'] },
        { fields: ['audit_type'] },
        { fields: ['job_id'] },
      ],
    }
  );

  return SeoAuditSession;
}

// ============================================================
// 2. SEO MODULE SCORES (Per-module scoring for trends)
// ============================================================

export class SeoModuleScore extends Model {
  public id!: number;
  public session_id!: number;
  public module_name!: string;
  public score!: number;
  public max_score!: number;
  public weight!: number;
  public metrics!: object; // Detailed breakdown
  public version!: string; // Scoring algorithm version
  public readonly created_at!: Date;
}

export function initSeoModuleScore(sequelize: Sequelize): typeof SeoModuleScore {
  SeoModuleScore.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'seo_audit_sessions',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      module_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'lighthouse, security, tech-js, responsive, etc.',
      },
      score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
          min: 0,
          max: 100,
        },
      },
      max_score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 100,
      },
      weight: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        comment: 'Weight in overall score calculation',
      },
      metrics: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Detailed metric breakdown',
      },
      version: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '1.0',
        comment: 'Scoring algorithm version',
      },
    },
    {
      sequelize,
      tableName: 'seo_module_scores',
      timestamps: true,
      underscored: true,
      updatedAt: false, // Only created_at
      indexes: [
        { fields: ['session_id'] },
        { fields: ['module_name'] },
        { fields: ['session_id', 'module_name'], unique: true },
      ],
    }
  );

  return SeoModuleScore;
}

// ============================================================
// 3. SEO ISSUES (Individual issues for filtering/aggregation)
// ============================================================

export class SeoIssue extends Model {
  public id!: number;
  public session_id!: number;
  public module_name!: string;
  public issue_type!: string;
  public severity!: string;
  public category!: string;
  public title!: string;
  public description!: string;
  public impact!: string;
  public recommendation!: string;
  public affected_element!: string | null;
  public page_url!: string | null;
  public line_number!: number | null;
  public metadata!: object | null;
  public status!: string;
  public resolved_at!: Date | null;
  public readonly created_at!: Date;
}

export function initSeoIssue(sequelize: Sequelize): typeof SeoIssue {
  SeoIssue.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'seo_audit_sessions',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      module_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      issue_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'performance, security, accessibility, seo, best-practice',
      },
      severity: {
        type: DataTypes.ENUM('critical', 'high', 'medium', 'low', 'info'),
        allowNull: false,
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'More specific categorization',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      impact: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recommendation: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      affected_element: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'CSS selector or element description',
      },
      page_url: {
        type: DataTypes.STRING(2048),
        allowNull: true,
      },
      line_number: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Additional context data',
      },
      status: {
        type: DataTypes.ENUM('open', 'acknowledged', 'fixed', 'wont_fix', 'false_positive'),
        allowNull: false,
        defaultValue: 'open',
      },
      resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'seo_issues',
      timestamps: true,
      underscored: true,
      updatedAt: false,
      indexes: [
        { fields: ['session_id'] },
        { fields: ['module_name'] },
        { fields: ['issue_type'] },
        { fields: ['severity'] },
        { fields: ['category'] },
        { fields: ['status'] },
        { fields: ['page_url'] },
      ],
    }
  );

  return SeoIssue;
}

// ============================================================
// 4. SEO PAGES (For multi-page audits like Internal SEO)
// ============================================================

export class SeoPage extends Model {
  public id!: number;
  public session_id!: number;
  public url!: string;
  public depth!: number;
  public status_code!: number;
  public load_time_ms!: number | null;
  public title!: string | null;
  public meta_description!: string | null;
  public word_count!: number | null;
  public internal_links_count!: number;
  public external_links_count!: number;
  public is_orphan!: boolean;
  public has_issues!: boolean;
  public readonly created_at!: Date;
}

export function initSeoPage(sequelize: Sequelize): typeof SeoPage {
  SeoPage.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'seo_audit_sessions',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      url: {
        type: DataTypes.STRING(2048),
        allowNull: false,
      },
      depth: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      status_code: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      load_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      meta_description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      word_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      internal_links_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      external_links_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_orphan: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      has_issues: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      tableName: 'seo_pages',
      timestamps: true,
      underscored: true,
      updatedAt: false,
      indexes: [
        { fields: ['session_id'] },
        { fields: ['url'] },
        { fields: ['depth'] },
        { fields: ['status_code'] },
        { fields: ['is_orphan'] },
      ],
    }
  );

  return SeoPage;
}

// ============================================================
// 5. SEO RAW DATA (JSON dump for full detail)
// ============================================================

export class SeoRawData extends Model {
  public id!: number;
  public session_id!: number;
  public module_name!: string;
  public raw_response!: object;
  public readonly created_at!: Date;
}

export function initSeoRawData(sequelize: Sequelize): typeof SeoRawData {
  SeoRawData.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'seo_audit_sessions',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      module_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      raw_response: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: 'Full API/analysis response for debugging',
      },
    },
    {
      sequelize,
      tableName: 'seo_raw_data',
      timestamps: true,
      underscored: true,
      updatedAt: false,
      indexes: [
        { fields: ['session_id'] },
        { fields: ['module_name'] },
      ],
    }
  );

  return SeoRawData;
}

// ============================================================
// Setup Relationships
// ============================================================

export function setupRelationships() {
  SeoAuditSession.hasMany(SeoModuleScore, { foreignKey: 'session_id', as: 'scores' });
  SeoAuditSession.hasMany(SeoIssue, { foreignKey: 'session_id', as: 'issues' });
  SeoAuditSession.hasMany(SeoPage, { foreignKey: 'session_id', as: 'pages' });
  SeoAuditSession.hasMany(SeoRawData, { foreignKey: 'session_id', as: 'raw_data' });

  SeoModuleScore.belongsTo(SeoAuditSession, { foreignKey: 'session_id', as: 'session' });
  SeoIssue.belongsTo(SeoAuditSession, { foreignKey: 'session_id', as: 'session' });
  SeoPage.belongsTo(SeoAuditSession, { foreignKey: 'session_id', as: 'session' });
  SeoRawData.belongsTo(SeoAuditSession, { foreignKey: 'session_id', as: 'session' });
}
