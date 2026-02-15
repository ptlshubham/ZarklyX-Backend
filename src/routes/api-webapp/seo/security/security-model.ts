import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class SecurityAnalysis extends Model<
  InferAttributes<SecurityAnalysis>,
  InferCreationAttributes<SecurityAnalysis>
> {
  declare id: CreationOptional<string>;
  declare url: string;
  declare protocol: CreationOptional<string>;
  
  // Summary scores
  declare securityScore: number;
  declare securityGrade: string;
  declare totalChecks: number;
  declare passedChecks: number;
  declare failedChecks: number;
  declare warningChecks: number;
  
  // HTTPS & Certificates
  declare hasHTTPS: boolean;
  declare hasHSTS: CreationOptional<boolean>;
  declare hstsMaxAge: CreationOptional<number>;
  declare certificateValid: CreationOptional<boolean>;
  declare certificateExpiryDays: CreationOptional<number>;
  declare certificateIssuer: CreationOptional<string>;
  
  // Security Headers
  declare hasCSP: CreationOptional<boolean>;
  declare hasXFrameOptions: CreationOptional<boolean>;
  declare hasXContentTypeOptions: CreationOptional<boolean>;
  declare hasReferrerPolicy: CreationOptional<boolean>;
  
  // Vulnerabilities
  declare hasMixedContent: CreationOptional<boolean>;
  declare mixedContentCount: CreationOptional<number>;
  declare knownVulnerabilities: CreationOptional<number>;
  declare xssRisk: CreationOptional<string>;
  
  // TLS/SSL
  declare tlsVersion: CreationOptional<string>;
  declare tlsSecure: CreationOptional<boolean>;
  
  // Category scores
  declare networkSecurityScore: CreationOptional<number>;
  declare applicationSecurityScore: CreationOptional<number>;
  declare serverSecurityScore: CreationOptional<number>;
  declare vulnerabilityScore: CreationOptional<number>;
  
  // Full analysis data (JSON)
  declare fullReport: CreationOptional<string>; // JSON string of complete security report
  declare aiIssues: CreationOptional<string>; // JSON string of AI-generated issues
  
  declare isDeleted: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof SecurityAnalysis {
    SecurityAnalysis.init(
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
          comment: "URL analyzed for security"
        },
        protocol: {
          type: DataTypes.STRING(10),
          allowNull: true,
          comment: "Protocol used (http/https)"
        },
        securityScore: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Overall security score (0-100)"
        },
        securityGrade: {
          type: DataTypes.STRING(5),
          allowNull: false,
          comment: "Security grade (A+ to F)"
        },
        totalChecks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Total number of security checks performed"
        },
        passedChecks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Number of passed checks"
        },
        failedChecks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Number of failed checks"
        },
        warningChecks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: "Number of warning checks"
        },
        hasHTTPS: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          comment: "Whether site uses HTTPS"
        },
        hasHSTS: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "HSTS header present"
        },
        hstsMaxAge: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "HSTS max-age in days"
        },
        certificateValid: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "SSL certificate validity"
        },
        certificateExpiryDays: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Days until certificate expiry"
        },
        certificateIssuer: {
          type: DataTypes.STRING(200),
          allowNull: true,
          comment: "Certificate issuer name"
        },
        hasCSP: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Content Security Policy present"
        },
        hasXFrameOptions: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "X-Frame-Options header present"
        },
        hasXContentTypeOptions: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "X-Content-Type-Options header present"
        },
        hasReferrerPolicy: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Referrer-Policy header present"
        },
        hasMixedContent: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Mixed content detected"
        },
        mixedContentCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of mixed content resources"
        },
        knownVulnerabilities: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of known vulnerabilities detected"
        },
        xssRisk: {
          type: DataTypes.STRING(20),
          allowNull: true,
          comment: "XSS risk level (LOW/MEDIUM/HIGH)"
        },
        tlsVersion: {
          type: DataTypes.STRING(20),
          allowNull: true,
          comment: "TLS/SSL version"
        },
        tlsSecure: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "TLS configuration secure"
        },
        networkSecurityScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Network security category score"
        },
        applicationSecurityScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Application security category score"
        },
        serverSecurityScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Server security category score"
        },
        vulnerabilityScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Vulnerability scan category score"
        },
        fullReport: {
          type: DataTypes.TEXT('long'),
          allowNull: true,
          comment: "Complete security report in JSON format"
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
        tableName: "security_analyses",
        timestamps: true,
        indexes: [
          {
            name: "idx_security_url",
            fields: ["url"],
          },
          {
            name: "idx_security_created",
            fields: ["createdAt"],
          },
          {
            name: "idx_security_url_created",
            fields: ["url", "createdAt"],
          },
          {
            name: "idx_security_score",
            fields: ["securityScore"],
          },
          {
            name: "idx_security_grade",
            fields: ["securityGrade"],
          },
          {
            name: "idx_security_created_desc",
            fields: [{name: "createdAt", order: "DESC"}],
          },
          {
            name: "idx_security_url_score_created",
            fields: ["url", "securityScore", "createdAt"],
          },
        ],
      }
    );
    return SecurityAnalysis;
  }
}
