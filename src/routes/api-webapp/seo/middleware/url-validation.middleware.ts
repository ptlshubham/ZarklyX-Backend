/**
 * URL Validation Middleware
 * Validates incoming URLs for SEO analysis endpoints
 * Prevents malformed URLs, injection attacks, and internal network access
 */

import { Request, Response, NextFunction } from 'express';
import { UrlValidator } from '../utils/http-client';

/**
 * Middleware to validate URL in request body
 * Supports both single URL and multiple URLs (batch)
 */
export function validateUrl(options: { allowLocalhost?: boolean; field?: string } = {}) {
  const { allowLocalhost = false, field = 'url' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = req.body[field];

      // Check if URL exists
      if (!url) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
        });
      }

      // Handle array of URLs (batch operations)
      if (Array.isArray(url)) {
        if (url.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'URL array cannot be empty',
          });
        }

        if (url.length > 100) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 100 URLs allowed per batch',
          });
        }

        // Validate each URL
        for (let i = 0; i < url.length; i++) {
          if (!UrlValidator.isValid(url[i], { allowLocalhost })) {
            return res.status(400).json({
              success: false,
              error: `Invalid URL at index ${i}: ${url[i]}`,
            });
          }
        }
      } else {
        // Single URL validation
        if (typeof url !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'URL must be a string',
          });
        }

        if (!UrlValidator.isValid(url, { allowLocalhost })) {
          return res.status(400).json({
            success: false,
            error: `Invalid or unsafe URL: ${url}`,
            details: [
              'URL must use http:// or https:// protocol',
              'URL must have a valid domain',
              'Internal/localhost URLs are blocked for security',
              'URL must not contain SQL injection patterns',
            ],
          });
        }

        // Sanitize the URL
        try {
          req.body[field] = UrlValidator.sanitize(url);
        } catch (error: any) {
          return res.status(400).json({
            success: false,
            error: 'Failed to sanitize URL',
            details: error.message,
          });
        }
      }

      next();
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'URL validation failed',
        details: error.message,
      });
    }
  };
}

/**
 * Validate URLs field (for batch operations)
 */
export const validateUrls = validateUrl({ field: 'urls' });

/**
 * Validate URL with localhost allowed (for testing)
 */
export const validateUrlWithLocalhost = validateUrl({ allowLocalhost: true });
