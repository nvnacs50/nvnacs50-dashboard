// IndexedDB Cache Manager for Student Data
// Ensures data structure matches Student and StudentDetails interfaces

import type { Student, StudentDetails } from './github-classroom-api';

const DB_NAME = 'github-classroom-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Validates that data matches the Student interface structure
 * This ensures cached data will work with UI components
 */
function validateStudent(data: any): data is Student {
  if (!data || typeof data !== 'object') return false;

  const required = [
    'id',
    'username',
    'name',
    'avatarUrl',
    'assignments',
    'completedCount',
    'totalAssignments',
    'progressPercentage',
    'status',
  ];

  for (const field of required) {
    if (!(field in data)) {
      console.error(`Missing required field: ${field}`);
      return false;
    }
  }

  // Validate types
  if (typeof data.id !== 'string') return false;
  if (typeof data.username !== 'string') return false;
  if (typeof data.name !== 'string') return false;
  if (typeof data.avatarUrl !== 'string') return false;
  if (!Array.isArray(data.assignments)) return false;
  if (typeof data.completedCount !== 'number') return false;
  if (typeof data.totalAssignments !== 'number') return false;
  if (typeof data.progressPercentage !== 'number') return false;
  if (!['passed', 'in_progress', 'failed'].includes(data.status)) return false;

  // Validate optional lastActive is string or undefined (not Date object!)
  if (data.lastActive !== undefined && typeof data.lastActive !== 'string') {
    console.error('lastActive must be ISO string, not Date object');
    return false;
  }

  // Validate assignments structure
  for (const assignment of data.assignments) {
    if (!assignment.name || typeof assignment.name !== 'string') return false;
    if (!assignment.repoName || typeof assignment.repoName !== 'string') return false;
    if (
      !['success', 'failure', 'in_progress', 'not_started', 'no_tests'].includes(
        assignment.status
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validates StudentDetails (extends Student with repos, commitActivity, totalCommits)
 */
function validateStudentDetails(data: any): data is StudentDetails {
  if (!validateStudent(data)) return false;

  // Additional StudentDetails fields (cast to any to avoid TypeScript errors)
  const details = data as any;

  if (!Array.isArray(details.repos)) return false;
  if (!Array.isArray(details.commitActivity)) return false;
  if (details.commitActivity.length !== 14) {
    console.error('commitActivity must be array of 14 numbers');
    return false;
  }
  if (typeof details.totalCommits !== 'number') return false;

  // Ensure commitActivity contains only numbers
  for (const count of details.commitActivity) {
    if (typeof count !== 'number') {
      console.error('commitActivity must contain only numbers');
      return false;
    }
  }

  return true;
}

/**
 * Validates array of Students
 */
function validateStudentsArray(data: any): data is Student[] {
  if (!Array.isArray(data)) return false;

  for (const student of data) {
    if (!validateStudent(student)) {
      return false;
    }
  }

  return true;
}

class CacheManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    // Don't initialize DB in constructor to avoid server-side errors
    // DB will be initialized lazily on first use
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    // Check if we're in browser environment
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is only available in browser');
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Save data to cache with TTL (time to live)
   * @param key - Cache key
   * @param data - Data to cache (must match Student/StudentDetails structure)
   * @param ttlMs - Time to live in milliseconds
   */
  async saveToCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
    // Validate data structure before caching
    if (key === 'students' && !validateStudentsArray(data)) {
      throw new Error('Invalid students array structure - data will not work with UI');
    }
    if (key.startsWith('student-details-') && !validateStudentDetails(data)) {
      throw new Error('Invalid student details structure - data will not work with UI');
    }

    const db = await this.initDB();
    const now = Date.now();

    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      expiresAt: now + ttlMs,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to save to cache'));
    });
  }

  /**
   * Get data from cache if not expired
   * @param key - Cache key
   * @returns Cached data or null if not found/expired
   */
  async getFromCache<T>(key: string): Promise<T | null> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        const now = Date.now();

        // Check if expired
        if (now > entry.expiresAt) {
          // Delete expired entry
          this.deleteFromCache(key);
          resolve(null);
          return;
        }

        // Validate structure before returning
        if (key === 'students' && !validateStudentsArray(entry.data)) {
          console.error('Cached students data has invalid structure, ignoring');
          this.deleteFromCache(key);
          resolve(null);
          return;
        }

        if (key.startsWith('student-details-') && !validateStudentDetails(entry.data)) {
          console.error('Cached student details has invalid structure, ignoring');
          this.deleteFromCache(key);
          resolve(null);
          return;
        }

        resolve(entry.data);
      };

      request.onerror = () => reject(new Error('Failed to read from cache'));
    });
  }

  /**
   * Check if cache entry exists and is not expired
   * @param key - Cache key
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns true if cache is fresh, false otherwise
   */
  async isCacheFresh(key: string, maxAgeMs: number): Promise<boolean> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<any> | undefined;

        if (!entry) {
          resolve(false);
          return;
        }

        const now = Date.now();
        const age = now - entry.timestamp;

        resolve(age < maxAgeMs && now < entry.expiresAt);
      };

      request.onerror = () => reject(new Error('Failed to check cache freshness'));
    });
  }

  /**
   * Get cache metadata (timestamp, age)
   */
  async getCacheMetadata(key: string): Promise<{
    timestamp: number;
    age: number;
    expiresAt: number;
  } | null> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<any> | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        const now = Date.now();

        resolve({
          timestamp: entry.timestamp,
          age: now - entry.timestamp,
          expiresAt: entry.expiresAt,
        });
      };

      request.onerror = () => reject(new Error('Failed to get cache metadata'));
    });
  }

  /**
   * Delete cache entry
   */
  async deleteFromCache(key: string): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete from cache'));
    });
  }

  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear cache'));
    });
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
