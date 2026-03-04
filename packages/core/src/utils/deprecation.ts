/**
 * Deprecation utilities
 * 
 * Provides logging for deprecated code paths to track usage and reduce dev debt.
 */

/**
 * Log a deprecation warning for a feature or code path
 * 
 * @param feature - Name of the deprecated feature
 * @param message - Deprecation message with context
 * @param options - Configuration for the warning
 */
export function logDeprecation(
  feature: string,
  message: string,
  options: {
    /** Recommended alternative (e.g., "Use ROI-based locator with layout profiles") */
    alternative?: string;
    /** When this feature will be removed */
    removalVersion?: string;
    /** Additional context or usage info */
    context?: string;
  } = {}
): void {
  const parts: string[] = [];
  
  parts.push(`⚠️  DEPRECATED: ${feature}`);
  if (options.context) {
    parts.push(`  Context: ${options.context}`);
  }
  parts.push(`  Message: ${message}`);
  if (options.alternative) {
    parts.push(`  Alternative: ${options.alternative}`);
  }
  if (options.removalVersion) {
    parts.push(`  Will be removed in: ${options.removalVersion}`);
  }
  
  console.warn(parts.join('\n'));
}

/**
 * Log deprecation warning specifically for legacy locator usage
 */
export function logLegacyLocatorUsage(context?: string): void {
  logDeprecation(
    'Legacy Titleblock Locator',
    'LegacyTitleblockLocator system is abandoned and will be removed in a future version.',
    {
      alternative: 'Use ROI-based locator with layout profiles for better performance and accuracy',
      removalVersion: 'v4.0.0',
      context: context || 'Legacy fallback in CompositeLocator',
    }
  );
}

/**
 * Log deprecation warning specifically for PDF AST system
 */
export function logPdfAstDeprecation(component: string): void {
  logDeprecation(
    'PDF AST System',
    'PDF AST-based extraction system is abandoned. Specs are now extracted to SpecDoc AST.',
    {
      alternative: 'Use transcript-based extraction with SpecDoc AST for specs documents',
      removalVersion: 'v4.0.0',
      context: component,
    }
  );
}
