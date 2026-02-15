import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class TechJsAnalysis extends Model<
  InferAttributes<TechJsAnalysis>,
  InferCreationAttributes<TechJsAnalysis>
> {
  declare id: CreationOptional<string>;
  declare url: string;
  
  // Framework Detection
  declare primaryFramework: CreationOptional<string>;
  declare frameworkVersion: CreationOptional<string>;
  declare frameworksDetected: CreationOptional<string>; // JSON array of detected frameworks
  declare totalFrameworks: CreationOptional<number>;
  
  // JavaScript Metrics
  declare totalJsSizeKB: CreationOptional<number>;
  declare renderBlockingScriptsCount: CreationOptional<number>;
  declare renderBlockingSizeKB: CreationOptional<number>;
  declare thirdPartyScriptsCount: CreationOptional<number>;
  declare thirdPartySizeKB: CreationOptional<number>;
  declare unusedJsPercentage: CreationOptional<number>;
  declare estimatedJsExecutionMs: CreationOptional<number>;
  
  // Rendering Type
  declare isClientSideRendering: CreationOptional<boolean>;
  declare isServerSideRendering: CreationOptional<boolean>;
  declare hasHydration: CreationOptional<boolean>;
  declare estimatedHydrationMs: CreationOptional<number>;
  declare jsRequiredForContent: CreationOptional<boolean>;
  declare contentVisiblePercentage: CreationOptional<number>;
  
  // Libraries & Dependencies
  declare librariesDetected: CreationOptional<string>; // JSON array
  declare totalLibraries: CreationOptional<number>;
  declare hasJQuery: CreationOptional<boolean>;
  declare hasReact: CreationOptional<boolean>;
  declare hasVue: CreationOptional<boolean>;
  declare hasAngular: CreationOptional<boolean>;
  declare hasNextJs: CreationOptional<boolean>;
  
  // SEO Impact
  declare seoImpactScore: CreationOptional<number>;
  declare crawlabilityStatus: CreationOptional<string>;
  declare indexabilityStatus: CreationOptional<string>;
  declare performanceImpact: CreationOptional<string>;
  
  // Dependency Score
  declare dependencyScore: CreationOptional<number>;
  declare dependencyStatus: CreationOptional<string>;
  
  // Full analysis data (JSON)
  declare fullReport: CreationOptional<string>; // JSON string of complete tech-js analysis
  declare aiIssues: CreationOptional<string>; // JSON string of AI-generated issues
  
  declare isDeleted: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof TechJsAnalysis {
    TechJsAnalysis.init(
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
          comment: "URL analyzed for tech stack"
        },
        primaryFramework: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: "Primary JavaScript framework detected"
        },
        frameworkVersion: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Version of primary framework"
        },
        frameworksDetected: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: "All frameworks detected (JSON array)"
        },
        totalFrameworks: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Total number of frameworks detected"
        },
        totalJsSizeKB: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
          comment: "Total JavaScript size in KB"
        },
        renderBlockingScriptsCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of render-blocking scripts"
        },
        renderBlockingSizeKB: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
          comment: "Size of render-blocking scripts in KB"
        },
        thirdPartyScriptsCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of third-party scripts"
        },
        thirdPartySizeKB: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
          comment: "Size of third-party scripts in KB"
        },
        unusedJsPercentage: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true,
          comment: "Percentage of unused JavaScript"
        },
        estimatedJsExecutionMs: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Estimated JS execution time in ms"
        },
        isClientSideRendering: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Client-side rendering detected"
        },
        isServerSideRendering: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Server-side rendering detected"
        },
        hasHydration: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Hydration detected (SSR + CSR)"
        },
        estimatedHydrationMs: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Estimated hydration delay in ms"
        },
        jsRequiredForContent: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "JavaScript required to view content"
        },
        contentVisiblePercentage: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true,
          comment: "Percentage of content visible without JS"
        },
        librariesDetected: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: "All libraries detected (JSON array)"
        },
        totalLibraries: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Total number of libraries detected"
        },
        hasJQuery: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          comment: "jQuery detected"
        },
        hasReact: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          comment: "React detected"
        },
        hasVue: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          comment: "Vue detected"
        },
        hasAngular: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          comment: "Angular detected"
        },
        hasNextJs: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          comment: "Next.js detected"
        },
        seoImpactScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "SEO impact score (0-100)"
        },
        crawlabilityStatus: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Crawlability status (good/warning/critical)"
        },
        indexabilityStatus: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Indexability status (good/warning/critical)"
        },
        performanceImpact: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Performance impact (low/medium/high)"
        },
        dependencyScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Dependency health score (0-100)"
        },
        dependencyStatus: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Dependency status (low/medium/high/critical)"
        },
        fullReport: {
          type: DataTypes.TEXT('long'),
          allowNull: true,
          comment: "Complete tech-js analysis in JSON format"
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
        tableName: "tech_js_analyses",
        timestamps: true,
        indexes: [
          {
            name: "idx_techjs_url",
            fields: ["url"],
          },
          {
            name: "idx_techjs_created",
            fields: ["createdAt"],
          },
          {
            name: "idx_techjs_url_created",
            fields: ["url", "createdAt"],
          },
          {
            name: "idx_techjs_framework",
            fields: ["primaryFramework"],
          },
          {
            name: "idx_techjs_created_desc",
            fields: [{name: "createdAt", order: "DESC"}],
          },
          {
            name: "idx_techjs_url_framework_created",
            fields: ["url", "primaryFramework", "createdAt"],
          },
        ],
      }
    );
    return TechJsAnalysis;
  }
}
