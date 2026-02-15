import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class LighthouseAnalysis extends Model<
  InferAttributes<LighthouseAnalysis>,
  InferCreationAttributes<LighthouseAnalysis>
> {
  declare id: CreationOptional<string>;
  declare url: string;
  declare finalUrl: CreationOptional<string>;
  declare fetchTime: CreationOptional<Date>;
  declare lighthouseVersion: CreationOptional<string>;
  
  // Core scores (0-100)
  declare performanceScore: number;
  declare accessibilityScore: number;
  declare bestPracticesScore: number;
  declare seoScore: number;
  declare pwaScore: CreationOptional<number>;
  declare overallScore: CreationOptional<number>;
  
  // Core Web Vitals
  declare fcpValue: CreationOptional<number>;
  declare fcpScore: CreationOptional<number>;
  declare lcpValue: CreationOptional<number>;
  declare lcpScore: CreationOptional<number>;
  declare clsValue: CreationOptional<number>;
  declare clsScore: CreationOptional<number>;
  declare speedIndexValue: CreationOptional<number>;
  declare speedIndexScore: CreationOptional<number>;
  declare ttiValue: CreationOptional<number>;
  declare ttiScore: CreationOptional<number>;
  declare tbtValue: CreationOptional<number>;
  declare tbtScore: CreationOptional<number>;
  
  // Resource Summary
  declare totalRequests: CreationOptional<number>;
  declare totalSizeBytes: CreationOptional<number>;
  declare totalSizeMB: CreationOptional<number>;
  declare thirdPartyRequests: CreationOptional<number>;
  
  // Counts
  declare totalOpportunities: CreationOptional<number>;
  declare totalFailedAudits: CreationOptional<number>;
  declare totalPassedAudits: CreationOptional<number>;
  
  // Full analysis data (JSON)
  declare fullReport: CreationOptional<string>; // JSON string of complete lighthouse result
  declare aiIssues: CreationOptional<string>; // JSON string of AI-generated issues
  
  declare isDeleted: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof LighthouseAnalysis {
    LighthouseAnalysis.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        url: {
          type: DataTypes.STRING(500),
          allowNull: false,
          comment: "Original URL analyzed"
        },
        finalUrl: {
          type: DataTypes.STRING(500),
          allowNull: true,
          comment: "Final URL after redirects"
        },
        fetchTime: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Timestamp when Lighthouse fetched the page"
        },
        lighthouseVersion: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Version of Lighthouse used"
        },
        performanceScore: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Performance score (0-100)"
        },
        accessibilityScore: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Accessibility score (0-100)"
        },
        bestPracticesScore: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Best practices score (0-100)"
        },
        seoScore: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "SEO score (0-100)"
        },
        pwaScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "PWA score (0-100)"
        },
        overallScore: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true,
          comment: "Weighted overall score"
        },
        fcpValue: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "First Contentful Paint (ms)"
        },
        fcpScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          comment: "FCP score (0-1)"
        },
        lcpValue: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Largest Contentful Paint (ms)"
        },
        lcpScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          comment: "LCP score (0-1)"
        },
        clsValue: {
          type: DataTypes.DECIMAL(5, 3),
          allowNull: true,
          comment: "Cumulative Layout Shift"
        },
        clsScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          comment: "CLS score (0-1)"
        },
        speedIndexValue: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Speed Index (ms)"
        },
        speedIndexScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          comment: "Speed Index score (0-1)"
        },
        ttiValue: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Time to Interactive (ms)"
        },
        ttiScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          comment: "TTI score (0-1)"
        },
        tbtValue: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Total Blocking Time (ms)"
        },
        tbtScore: {
          type: DataTypes.DECIMAL(3, 2),
          allowNull: true,
          comment: "TBT score (0-1)"
        },
        totalRequests: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Total number of HTTP requests"
        },
        totalSizeBytes: {
          type: DataTypes.BIGINT,
          allowNull: true,
          comment: "Total page size in bytes"
        },
        totalSizeMB: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
          comment: "Total page size in MB"
        },
        thirdPartyRequests: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of third-party requests"
        },
        totalOpportunities: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of performance opportunities"
        },
        totalFailedAudits: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of failed audits"
        },
        totalPassedAudits: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of passed audits"
        },
        fullReport: {
          type: DataTypes.TEXT('long'),
          allowNull: true,
          comment: "Complete Lighthouse report in JSON format"
        },
        aiIssues: {
          type: DataTypes.TEXT('long'),
          allowNull: true,
          comment: "AI-generated insights in JSON format"
        },
        isDeleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "lighthouse_analyses",
        timestamps: true,
        indexes: [
          {
            name: "idx_lighthouse_url",
            fields: ["url"],
          },
          {
            name: "idx_lighthouse_created",
            fields: ["createdAt"],
          },
          {
            name: "idx_lighthouse_url_created",
            fields: ["url", "createdAt"],
          },
          {
            name: "idx_lighthouse_performance_score",
            fields: ["performanceScore"],
          },
          {
            name: "idx_lighthouse_overall_score",
            fields: ["overallScore"],
          },
          {
            name: "idx_lighthouse_created_desc",
            fields: [{name: "createdAt", order: "DESC"}],
          },
          {
            name: "idx_lighthouse_url_overall_created",
            fields: ["url", "overallScore", "createdAt"],
          },
        ],
      }
    );
    return LighthouseAnalysis;
  }
}
