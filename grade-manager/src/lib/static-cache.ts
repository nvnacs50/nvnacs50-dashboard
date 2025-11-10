// Static Cache Loader - loads pre-generated JSON from GitHub Actions

import type { Student } from './github-classroom-api';

export interface StaticCacheMetadata {
  timestamp: number;
  generatedAt: string;
  studentCount: number;
  totalRepos: number;
  version: string;
}

export interface StaticCacheData {
  students: Student[];
  metadata: StaticCacheMetadata;
}

/**
 * Fetches static cache metadata from public/cache/metadata.json
 * Returns null if file doesn't exist (first time, or Action hasn't run yet)
 */
export async function fetchStaticCacheMetadata(): Promise<StaticCacheMetadata | null> {
  try {
    const basePath = process.env.NODE_ENV === 'production' ? '/nvnacs50-dashboard' : '';
    const response = await fetch(`${basePath}/cache/metadata.json`, {
      cache: 'no-store', // Always fetch fresh metadata
    });

    if (!response.ok) {
      return null;
    }

    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.warn('Static cache metadata not found (GitHub Action may not have run yet)');
    return null;
  }
}

/**
 * Fetches static cache students data from public/cache/students.json
 * Returns null if file doesn't exist
 */
export async function fetchStaticCacheStudents(): Promise<Student[] | null> {
  try {
    const basePath = process.env.NODE_ENV === 'production' ? '/nvnacs50-dashboard' : '';
    const response = await fetch(`${basePath}/cache/students.json`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const students = await response.json();

    // Basic validation
    if (!Array.isArray(students)) {
      console.error('Static cache students.json is not an array');
      return null;
    }

    return students;
  } catch (error) {
    console.warn('Static cache students.json not found');
    return null;
  }
}

/**
 * Fetches complete static cache (metadata + students)
 * Returns null if either file is missing
 */
export async function fetchStaticCache(): Promise<StaticCacheData | null> {
  try {
    const [metadata, students] = await Promise.all([
      fetchStaticCacheMetadata(),
      fetchStaticCacheStudents(),
    ]);

    if (!metadata || !students) {
      return null;
    }

    return {
      students,
      metadata,
    };
  } catch (error) {
    console.error('Failed to fetch static cache:', error);
    return null;
  }
}

/**
 * Check if static cache is fresh (less than maxAgeMs old)
 */
export async function isStaticCacheFresh(maxAgeMs: number): Promise<boolean> {
  const metadata = await fetchStaticCacheMetadata();

  if (!metadata) {
    return false;
  }

  const now = Date.now();
  const age = now - metadata.timestamp;

  return age < maxAgeMs;
}
