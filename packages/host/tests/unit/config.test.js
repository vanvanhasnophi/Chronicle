/**
 * Unit tests for Chronicle Host config module.
 */
const config = require('../../src/config');

describe('config', () => {
  it('exports all required path constants', () => {
    expect(config.BASE_DIR).toBeDefined();
    expect(config.DATA_DIR).toBeDefined();
    expect(config.UPLOAD_DIR).toBeDefined();
    expect(config.BRANDING_DIR).toBeDefined();
    expect(config.MANAGER_BACKGROUND_DIR).toBeDefined();
    expect(config.POSTS_DIR).toBeDefined();
  });

  it('exports data file paths', () => {
    expect(config.SECURITY_FILE).toBeDefined();
    expect(config.SETTINGS_FILE).toBeDefined();
    expect(config.COLLECTION_FILE).toBeDefined();
    expect(config.INDEX_FILE).toBeDefined();
    expect(config.ACCESS_LOG).toBeDefined();
  });

  it('exports port and defaults', () => {
    expect(config.PORT).toBe(3000);
    expect(config.DEFAULT_MANAGER_DOMAIN).toBe('blogmanager.eightyfor.top');
    expect(config.DEFAULT_BUILD_SETTINGS).toHaveProperty('frontendUrl');
    expect(config.DEFAULT_BUILD_SETTINGS).toHaveProperty('frontendCodeDir');
  });

  it('exports valid build granularities', () => {
    expect(config.VALID_BUILD_GRANULARITIES).toBeInstanceOf(Set);
    expect(config.VALID_BUILD_GRANULARITIES.has('full')).toBe(true);
    expect(config.VALID_BUILD_GRANULARITIES.has('posts')).toBe(true);
    expect(config.VALID_BUILD_GRANULARITIES.has('index')).toBe(true);
  });

  it('exports file categories', () => {
    expect(Array.isArray(config.CATEGORIES)).toBe(true);
    expect(config.CATEGORIES.includes('pic')).toBe(true);
    expect(config.CATEGORIES.includes('video')).toBe(true);
  });

  it('exports traffic config', () => {
    expect(config.VALID_TRAFFIC_RANGES).toBeInstanceOf(Set);
    expect(config.TRAFFIC_RANGE_ALIASES).toHaveProperty('1', '1d');
    expect(config.TRAFFIC_RANGE_ALIASES).toHaveProperty('all', '30d');
  });
});
