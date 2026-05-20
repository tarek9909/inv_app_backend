/**
 * Simple in-memory TTL cache for expensive queries.
 * Not suitable for multi-instance deployments without shared cache (Redis).
 */
class MemoryCache {
  constructor(defaultTtlMs = 30000) {
    this.store = new Map();
    this.defaultTtl = defaultTtlMs;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtl)
    });
    return value;
  }

  invalidate(key) {
    this.store.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }

  /**
   * Get-or-set pattern: returns cached value or computes and caches it.
   * @param {string} key
   * @param {Function} computeFn - async function to compute the value
   * @param {number} [ttlMs] - optional TTL override
   */
  async getOrSet(key, computeFn, ttlMs) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await computeFn();
    return this.set(key, value, ttlMs);
  }
}

// Shared cache instances
const dashboardCache = new MemoryCache(30000); // 30s
const settingsCache = new MemoryCache(300000); // 5min
const reportCache = new MemoryCache(60000); // 1min

module.exports = { MemoryCache, dashboardCache, settingsCache, reportCache };
