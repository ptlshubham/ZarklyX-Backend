/**
 * LinkedIn Scope Management System
 * 
 * Supports both Developer Mode and Production Mode
 * Scopes can be toggled via environment variables without changing code
 * 
 * Usage:
 * - LINKEDIN_MODE=development (default) - Personal profile scopes only
 * - LINKEDIN_MODE=production - Organization + Personal scopes
 */

/**
 * All available LinkedIn scopes
 */
export const LinkedInScopes = {
  // ============ TIER 1: ALWAYS AVAILABLE ============
  // Required for basic OAuth and user identification
  OPENID: 'openid',
  PROFILE: 'profile',
  EMAIL: 'email',

  // ============ TIER 2: DEVELOPER MODE (Default) ============
  // Available immediately for testing
  W_MEMBER_SOCIAL: 'w_member_social', // Post on own profile
  R_EVENTS: 'r_events', // Read events
  RW_EVENTS: 'rw_events', // Manage events

  // ============ TIER 3: PRODUCTION MODE (Approval Required) ============
  // Requires LinkedIn app approval + scope request approval
  W_ORGANIZATION_SOCIAL: 'w_organization_social', // Post on org pages
  RW_ORGANIZATION_ADMIN: 'rw_organization_admin', // Manage org pages
  R_ORGANIZATION_ADMIN: 'r_organization_admin', // Read org data
  R_ORGANIZATION_SOCIAL_ANALYTICS: 'r_organization_social_analytics', // View analytics
  R_ORGANIZATION_ADMINLIST: 'r_organization_adminlist', // List admins
  R_ORGANIZATION_MEMBERS: 'r_organization_members' // View members
};

/**
 * Scope tier definitions
 */
export const ScopeTiers = {
  BASE: {
    name: 'Base',
    description: 'Required for all OAuth flows',
    scopes: [
      LinkedInScopes.OPENID,
      LinkedInScopes.PROFILE,
      LinkedInScopes.EMAIL
    ]
  },

  PERSONAL: {
    name: 'Personal Profile',
    description: 'Post and manage personal profile (Developer Mode)',
    scopes: [
      LinkedInScopes.W_MEMBER_SOCIAL
    ]
  },

  EVENTS: {
    name: 'Events Management',
    description: 'Read and manage events (Developer Mode)',
    scopes: [
      LinkedInScopes.R_EVENTS,
      LinkedInScopes.RW_EVENTS
    ]
  },

  ORGANIZATION: {
    name: 'Organization Pages',
    description: 'Manage company pages and analytics (Production Mode - Approval Required)',
    scopes: [
      LinkedInScopes.W_ORGANIZATION_SOCIAL,
      LinkedInScopes.RW_ORGANIZATION_ADMIN,
      LinkedInScopes.R_ORGANIZATION_ADMIN,
      LinkedInScopes.R_ORGANIZATION_SOCIAL_ANALYTICS,
      LinkedInScopes.R_ORGANIZATION_ADMINLIST,
      LinkedInScopes.R_ORGANIZATION_MEMBERS
    ]
  }
};

/**
 * LinkedIn integration modes
 */
export enum LinkedInMode {
  DEVELOPMENT = 'development', // Default - personal profile only
  PRODUCTION = 'production'     // After LinkedIn approval - org pages
}

/**
 * Get the current mode from environment
 * Default: DEVELOPMENT
 */
export function getCurrentMode(): LinkedInMode {
  const mode = process.env.LINKEDIN_MODE || 'development';
  return mode === 'production' ? LinkedInMode.PRODUCTION : LinkedInMode.DEVELOPMENT;
}

/**
 * Get all scopes for current mode
 * 
 * DEVELOPMENT mode:
 * - openid, profile, email, w_member_social, r_events, rw_events
 * - Can post on personal profile
 * - Can read and manage events
 * - Cannot access organization pages
 * 
 * PRODUCTION mode:
 * - openid, profile, email, w_member_social, r_events, rw_events
 * - w_organization_social, rw_organization_admin
 * - r_organization_social_analytics, etc.
 * - Full organization page management
 * 
 * @param mode - Optional mode override
 * @returns Array of scope strings
 */
export function getScopesForMode(mode?: LinkedInMode): string[] {
  const currentMode = mode || getCurrentMode();
  
  const baseScopes = [...ScopeTiers.BASE.scopes];
  const personalScopes = [...ScopeTiers.PERSONAL.scopes];
  const eventScopes = [...ScopeTiers.EVENTS.scopes];
  const organizationScopes = [...ScopeTiers.ORGANIZATION.scopes];

  if (currentMode === LinkedInMode.PRODUCTION) {
    // Production: All scopes (base + personal + events + organization)
    return [...baseScopes, ...personalScopes, ...eventScopes, ...organizationScopes];
  } else {
    // Development: Base + personal + events only
    return [...baseScopes, ...personalScopes, ...eventScopes];
  }
}

/**
 * Get scope description for UI display
 */
export function getScopeDescription(mode?: LinkedInMode): string {
  const currentMode = mode || getCurrentMode();
  
  if (currentMode === LinkedInMode.PRODUCTION) {
    return 'Full access: Personal profile + Events + Organization pages + Analytics';
  } else {
    return 'Personal profile + Events: Post on own profile and manage events (Development Mode)';
  }
}

/**
 * Check if specific scope is available in current mode
 */
export function isScopeAvailable(scope: string, mode?: LinkedInMode): boolean {
  const scopes = getScopesForMode(mode);
  return scopes.includes(scope);
}

/**
 * Check if organization features are available
 */
export function isOrganizationModeEnabled(mode?: LinkedInMode): boolean {
  return (mode || getCurrentMode()) === LinkedInMode.PRODUCTION;
}

/**
 * Get scope requirements for a specific feature
 */
export const FeatureScopeRequirements = {
  PERSONAL_POST: {
    feature: 'Post on Personal Profile',
    requiredScopes: [LinkedInScopes.W_MEMBER_SOCIAL],
    availableIn: LinkedInMode.DEVELOPMENT
  },

  READ_EVENTS: {
    feature: 'Read Events',
    requiredScopes: [LinkedInScopes.R_EVENTS],
    availableIn: LinkedInMode.DEVELOPMENT
  },

  MANAGE_EVENTS: {
    feature: 'Manage Events',
    requiredScopes: [LinkedInScopes.RW_EVENTS],
    availableIn: LinkedInMode.DEVELOPMENT
  },

  ORG_POST: {
    feature: 'Post on Organization Page',
    requiredScopes: [LinkedInScopes.W_ORGANIZATION_SOCIAL],
    availableIn: LinkedInMode.PRODUCTION
  },

  ORG_MANAGE: {
    feature: 'Manage Organization Pages',
    requiredScopes: [
      LinkedInScopes.RW_ORGANIZATION_ADMIN,
      LinkedInScopes.R_ORGANIZATION_ADMIN
    ],
    availableIn: LinkedInMode.PRODUCTION
  },

  ORG_ANALYTICS: {
    feature: 'View Organization Analytics',
    requiredScopes: [LinkedInScopes.R_ORGANIZATION_SOCIAL_ANALYTICS],
    availableIn: LinkedInMode.PRODUCTION
  },

  ORG_MEMBERS: {
    feature: 'Manage Organization Members',
    requiredScopes: [LinkedInScopes.R_ORGANIZATION_MEMBERS],
    availableIn: LinkedInMode.PRODUCTION
  }
};

/**
 * Check if a feature is available
 */
export function isFeatureAvailable(
  featureKey: keyof typeof FeatureScopeRequirements,
  mode?: LinkedInMode
): boolean {
  const feature = FeatureScopeRequirements[featureKey];
  const currentMode = mode || getCurrentMode();
  
  // Check if mode matches
  if (feature.availableIn !== currentMode) {
    return false;
  }
  
  // Check if all required scopes are available
  const availableScopes = getScopesForMode(currentMode);
  return feature.requiredScopes.every(scope => availableScopes.includes(scope));
}

/**
 * Get feature availability report (for debugging/logging)
 */
export function getFeatureAvailabilityReport(mode?: LinkedInMode) {
  const currentMode = mode || getCurrentMode();
  const report: any = {
    currentMode,
    scopeDescription: getScopeDescription(currentMode),
    availableScopes: getScopesForMode(currentMode),
    features: {}
  };

  for (const [key, feature] of Object.entries(FeatureScopeRequirements)) {
    report.features[key] = {
      available: isFeatureAvailable(key as any, currentMode),
      feature: feature.feature,
      requiredScopes: feature.requiredScopes
    };
  }

  return report;
}

/**
 * Format scopes as space-separated string for OAuth URLs
 */
export function formatScopesForOAuth(mode?: LinkedInMode): string {
  return getScopesForMode(mode).join(' ');
}

/**
 * Log scope configuration (useful for debugging)
 */
export function logScopeConfiguration() {
  const report = getFeatureAvailabilityReport();
  console.log('[LINKEDIN SCOPES] Current Configuration:');
  console.log(`  Mode: ${report.currentMode.toUpperCase()}`);
  console.log(`  Description: ${report.scopeDescription}`);
  console.log(`  Available Scopes: ${report.availableScopes.join(', ')}`);
  console.log('\n[LINKEDIN FEATURES] Availability:');
  
  for (const [key, feature] of Object.entries(report.features)) {
    const status = (feature as any).available ? '✅' : '❌';
    console.log(`  ${status} ${(feature as any).feature}`);
  }
}

export default {
  LinkedInScopes,
  ScopeTiers,
  LinkedInMode,
  getCurrentMode,
  getScopesForMode,
  getScopeDescription,
  isScopeAvailable,
  isOrganizationModeEnabled,
  FeatureScopeRequirements,
  isFeatureAvailable,
  getFeatureAvailabilityReport,
  formatScopesForOAuth,
  logScopeConfiguration
};
