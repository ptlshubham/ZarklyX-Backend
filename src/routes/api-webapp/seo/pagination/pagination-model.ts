import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class PaginationAnalysis extends Model<
  InferAttributes<PaginationAnalysis>,
  InferCreationAttributes<PaginationAnalysis>
> {
  declare id: CreationOptional<string>;
  declare url: string;
  
  // Pagination Detection
  declare hasPagination: boolean;
  declare paginationType: CreationOptional<string>;
  declare totalPagesFound: CreationOptional<number>;
  declare maxDepthReached: CreationOptional<number>;
  
  // Implementation Quality
  declare hasRelNext: CreationOptional<boolean>;
  declare hasRelPrev: CreationOptional<boolean>;
  declare hasCanonical: CreationOptional<boolean>;
  declare hasViewallPage: CreationOptional<boolean>;
  declare implementationScore: CreationOptional<number>;
  
  // SEO Issues
  declare hasDuplicateContent: CreationOptional<boolean>;
  declare hasOrphanedPages: CreationOptional<boolean>;
  declare orphanedPagesCount: CreationOptional<number>;
  declare hasBrokenPaginationLinks: CreationOptional<boolean>;
  declare brokenLinksCount: CreationOptional<number>;
  
  // Pagination Structure
  declare paginationPattern: CreationOptional<string>;
  declare paginationSelector: CreationOptional<string>;
  declare nextPageSelector: CreationOptional<string>;
  declare prevPageSelector: CreationOptional<string>;
  
  // Performance
  declare avgLoadTimeMs: CreationOptional<number>;
  declare slowestPageLoadMs: CreationOptional<number>;
  
  // Full analysis data (JSON)
  declare fullReport: CreationOptional<string>; // JSON string of complete pagination analysis
  declare pagesAnalyzed: CreationOptional<string>; // JSON array of all pages found
  declare aiIssues: CreationOptional<string>; // JSON string of AI-generated issues
  
  declare isDeleted: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof PaginationAnalysis {
    PaginationAnalysis.init(
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
          comment: "Base URL analyzed for pagination"
        },
        hasPagination: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          comment: "Whether pagination was detected"
        },
        paginationType: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "Type of pagination (numeric/numbered/load-more/infinite-scroll)"
        },
        totalPagesFound: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Total number of paginated pages found"
        },
        maxDepthReached: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Maximum pagination depth crawled"
        },
        hasRelNext: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "rel=next link present"
        },
        hasRelPrev: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "rel=prev link present"
        },
        hasCanonical: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Canonical tags present"
        },
        hasViewallPage: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "View-all page detected"
        },
        implementationScore: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Pagination implementation quality score (0-100)"
        },
        hasDuplicateContent: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Duplicate content detected across pages"
        },
        hasOrphanedPages: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Orphaned pagination pages detected"
        },
        orphanedPagesCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of orphaned pages"
        },
        hasBrokenPaginationLinks: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          comment: "Broken pagination links detected"
        },
        brokenLinksCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Number of broken pagination links"
        },
        paginationPattern: {
          type: DataTypes.STRING(200),
          allowNull: true,
          comment: "Detected pagination URL pattern"
        },
        paginationSelector: {
          type: DataTypes.STRING(200),
          allowNull: true,
          comment: "CSS selector for pagination"
        },
        nextPageSelector: {
          type: DataTypes.STRING(200),
          allowNull: true,
          comment: "CSS selector for next page link"
        },
        prevPageSelector: {
          type: DataTypes.STRING(200),
          allowNull: true,
          comment: "CSS selector for previous page link"
        },
        avgLoadTimeMs: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Average load time for paginated pages"
        },
        slowestPageLoadMs: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Slowest page load time"
        },
        fullReport: {
          type: DataTypes.TEXT('long'),
          allowNull: true,
          comment: "Complete pagination analysis in JSON format"
        },
        pagesAnalyzed: {
          type: DataTypes.TEXT('long'),
          allowNull: true,
          comment: "Array of all pages found (JSON)"
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
        tableName: "pagination_analyses",
        timestamps: true,
        indexes: [
          {
            name: "idx_pagination_url",
            fields: ["url"],
          },
          {
            name: "idx_pagination_created",
            fields: ["createdAt"],
          },
          {
            name: "idx_pagination_url_created",
            fields: ["url", "createdAt"],
          },
          {
            name: "idx_pagination_created_desc",
            fields: [{name: "createdAt", order: "DESC"}],
          },
          {
            name: "idx_pagination_has_pagination",
            fields: ["hasPagination"],
          },
        ],
      }
    );
    return PaginationAnalysis;
  }
}
