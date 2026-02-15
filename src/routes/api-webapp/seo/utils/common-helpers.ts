import { Request } from 'express';

/**
 * Extract account email from headers, query params, or body
 * Centralizes the extraction logic to avoid duplication
 */
export function extractAccountEmail(req: Request): string {
  const accountEmail = (
    (req.headers['x-account-email'] as string) || 
    (req.query.accountEmail as string) || 
    (req.body?.accountEmail as string) || 
    ''
  ).trim();
  
  return accountEmail;
}

/**
 * Standardized error response helper
 */
export function createErrorResponse(error: any, defaultMessage: string) {
  return {
    success: false,
    error: error.message || defaultMessage,
    timestamp: new Date().toISOString()
  };
}

/**
 * Standardized success response helper
 */
export function createSuccessResponse(data: any) {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    ...data
  };
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize URL for database storage
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove trailing slashes and normalize
    return urlObj.href.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get date range (last N days)
 */
export function getDateRange(days: number = 30): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };
}
