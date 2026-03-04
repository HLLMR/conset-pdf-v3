/**
 * Feature flags for experimental and deprecated features
 * 
 * These flags control behavior of abandoned/legacy systems.
 * By default, deprecated features are DISABLED to reduce dev debt.
 */

/**
 * Feature flag configuration
 */
interface FeatureFlagConfig {
  /** Enable legacy locator fallback (deprecated system). Default: false */
  ENABLE_LEGACY_LOCATOR: boolean;
}

/**
 * Runtime feature flag state
 */
let _flags: FeatureFlagConfig = {
  ENABLE_LEGACY_LOCATOR: parseEnvironmentFlag('ENABLE_LEGACY_LOCATOR', false),
};

/**
 * Parse environment variable as boolean flag
 */
function parseEnvironmentFlag(envVarName: string, defaultValue: boolean): boolean {
  const envValue = process.env[envVarName];
  if (envValue === undefined) {
    return defaultValue;
  }
  return envValue.toLowerCase() === 'true' || envValue === '1';
}

/**
 * Get current value of a feature flag
 */
export function getFeatureFlag(name: keyof FeatureFlagConfig): boolean {
  return _flags[name];
}

/**
 * Set feature flag at runtime
 */
export function setFeatureFlag(name: keyof FeatureFlagConfig, value: boolean): void {
  _flags[name] = value;
}

/**
 * Reset all feature flags to their default values
 */
export function resetFeatureFlags(): void {
  _flags = {
    ENABLE_LEGACY_LOCATOR: parseEnvironmentFlag('ENABLE_LEGACY_LOCATOR', false),
  };
}

/**
 * Check if legacy locator is enabled
 */
export function isLegacyLocatorEnabled(): boolean {
  return getFeatureFlag('ENABLE_LEGACY_LOCATOR');
}
