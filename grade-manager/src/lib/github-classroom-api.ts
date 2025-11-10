// GitHub Classroom API Client for Teachers

export interface Assignment {
  name: string;
  repoName: string;
  status: 'success' | 'failure' | 'in_progress' | 'not_started' | 'no_tests';
  score?: number;
  maxScore?: number;
  lastCommitDate?: string;
  lastCommitMessage?: string;
  workflowStatus?: string;
}

export interface Student {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
  assignments: Assignment[];
  completedCount: number;
  totalAssignments: number;
  progressPercentage: number;
  lastActive?: string;
  status: 'passed' | 'in_progress' | 'failed';
}

export interface StudentDetails extends Student {
  repos: any[];
  commitActivity: number[];
  totalCommits: number;
}

const CS50_ASSIGNMENTS = [
  { name: 'hello', alternativeNames: ['me'] },
  { name: 'mario-less', group: 'mario' },
  { name: 'mario-more', group: 'mario' },
  { name: 'cash', group: 'cash-credit' },
  { name: 'credit', group: 'cash-credit' },
  { name: 'scrabble' },
  { name: 'readability' },
  { name: 'caesar', group: 'cipher' },
  { name: 'substitution', group: 'cipher' },
  { name: 'sort' },
  { name: 'plurality' },
  { name: 'runoff', group: 'voting' },
  { name: 'tideman', group: 'voting' },
  { name: 'volume' },
  { name: 'filter-less', group: 'filter' },
  { name: 'filter-more', group: 'filter' },
  { name: 'recover' },
  { name: 'inheritance' },
  { name: 'speller' },
];

export class GitHubClassroomAPI {
  private token: string;
  private org: string;
  private cache: Map<string, { data: any; timestamp: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CONCURRENT_REQUESTS = 50; // Limit concurrent API calls

  constructor(token: string, org: string = 'nvnacs50') {
    this.token = token;
    this.org = org;
    this.cache = new Map();
  }

  // Helper to batch promises for controlled concurrency
  private async batchPromises<T>(
    items: any[],
    promiseFn: (item: any) => Promise<T>,
    batchSize: number = this.CONCURRENT_REQUESTS
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(promiseFn));
      results.push(...batchResults);
    }

    return results;
  }

  private async fetchWithAuth(url: string) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getOrganizationRepos(): Promise<any[]> {
    const cacheKey = `repos-${this.org}`;
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) return cached;

    const repos: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.github.com/orgs/${this.org}/repos?per_page=100&page=${page}&sort=updated`;
      const pageRepos = await this.fetchWithAuth(url);

      if (pageRepos.length === 0) {
        hasMore = false;
      } else {
        repos.push(...pageRepos);
        page++;
      }
    }

    // Filter out non-assignment repos
    const assignmentRepos = repos.filter(repo => {
      const repoName = repo.name.toLowerCase();
      // Exclude org repos like .github, dashboards, etc.
      return !repoName.includes('dashboard') &&
             !repoName.includes('.github') &&
             !repoName.startsWith('.');
    });

    this.setCache(cacheKey, assignmentRepos);
    return assignmentRepos;
  }

  private parseAssignmentName(repoName: string): string | null {
    const lower = repoName.toLowerCase();

    // Remove common prefixes
    let cleaned = lower.replace(/^nvnacs50-/i, '');

    // Try to match against known assignments (order matters - check longer names first!)
    // Sort by length descending to match "mario-less" before "mario"
    const sortedAssignments = [...CS50_ASSIGNMENTS].sort((a, b) => {
      const aLen = a.name.length;
      const bLen = b.name.length;
      return bLen - aLen;
    });

    for (const assignment of sortedAssignments) {
      // Check if repo name starts with assignment name
      if (cleaned.startsWith(assignment.name + '-') || cleaned === assignment.name) {
        return assignment.name;
      }
      if (assignment.alternativeNames) {
        for (const alt of assignment.alternativeNames) {
          if (cleaned.startsWith(alt + '-') || cleaned === alt) {
            return assignment.name;
          }
        }
      }
    }

    // Fallback: try to extract first part as assignment name
    const parts = cleaned.split('-');
    if (parts.length >= 2) {
      // Check if first part matches any assignment
      for (const assignment of CS50_ASSIGNMENTS) {
        if (assignment.name === parts[0]) {
          return assignment.name;
        }
        if (assignment.alternativeNames?.includes(parts[0])) {
          return assignment.name;
        }
      }
    }

    return null;
  }

  private extractUsernameFromRepo(repoName: string): string | null {
    // Extract username from repo name format: "nvnacs50-{assignment}-{username}"
    // Example: "nvnacs50-mario-less-damqnkisa" → "damqnkisa"

    const lower = repoName.toLowerCase();

    // Remove organization prefix
    let cleaned = lower.replace(/^nvnacs50-/i, '');

    // Get the assignment name
    const assignmentName = this.parseAssignmentName(repoName);
    if (!assignmentName) {
      // Can't parse assignment, can't extract username
      return null;
    }

    // Remove assignment name and the dash after it
    if (cleaned.startsWith(assignmentName + '-')) {
      const username = cleaned.substring(assignmentName.length + 1);
      return username;
    }

    // Check alternative names too
    const assignment = CS50_ASSIGNMENTS.find(a => a.name === assignmentName);
    if (assignment?.alternativeNames) {
      for (const alt of assignment.alternativeNames) {
        if (cleaned.startsWith(alt + '-')) {
          const username = cleaned.substring(alt.length + 1);
          return username;
        }
      }
    }

    return null;
  }

  async getWorkflowStatus(owner: string, repo: string): Promise<any> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=1`;
      const data = await this.fetchWithAuth(url);
      return data.workflow_runs?.[0] || null;
    } catch (error) {
      console.warn(`Failed to fetch workflow for ${repo}:`, error);
      return null;
    }
  }

  async getLatestCommit(owner: string, repo: string): Promise<any> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
      const commits = await this.fetchWithAuth(url);
      return commits[0] || null;
    } catch (error) {
      console.warn(`Failed to fetch commits for ${repo}:`, error);
      return null;
    }
  }

  private determineStatus(workflow: any, commit: any): Assignment['status'] {
    if (!commit) return 'not_started';
    if (!workflow) return 'no_tests';

    if (workflow.status === 'in_progress' || workflow.status === 'queued') {
      return 'in_progress';
    }

    return workflow.conclusion === 'success' ? 'success' : 'failure';
  }

  async getAllStudents(onProgress?: (current: number, total: number) => void): Promise<Student[]> {
    const repos = await this.getOrganizationRepos();

    // Group repos by student (extract username from repo name)
    const studentReposMap = new Map<string, any[]>();

    for (const repo of repos) {
      // Extract username from repo name: "nvnacs50-assignment-username"
      const username = this.extractUsernameFromRepo(repo.name);
      if (!username) continue; // Skip repos we can't parse

      if (!studentReposMap.has(username)) {
        studentReposMap.set(username, []);
      }
      studentReposMap.get(username)!.push(repo);
    }

    const studentUsernames = Array.from(studentReposMap.keys());

    // OPTIMIZATION: Fetch ALL workflow and commit data in controlled batches
    // This is much faster than fetching per student, and prevents rate limiting
    const allRepoData = (await this.batchPromises(
      repos,
      async (repo) => {
        const assignmentName = this.parseAssignmentName(repo.name);
        if (!assignmentName) return null;

        const [workflow, commit] = await Promise.all([
          this.getWorkflowStatus(this.org, repo.name),
          this.getLatestCommit(this.org, repo.name),
        ]);

        return {
          repoName: repo.name,
          ownerLogin: repo.owner.login,
          assignmentName,
          workflow,
          commit,
          avatarUrl: repo.owner.avatar_url,
        };
      }
    )).filter(d => d !== null);

    // Build student objects from fetched data
    const students: Student[] = [];
    let processed = 0;

    for (const username of studentUsernames) {
      const studentRepoData = allRepoData.filter(
        d => this.extractUsernameFromRepo(d!.repoName) === username
      );

      const assignments: Assignment[] = studentRepoData.map(data => {
        const status = this.determineStatus(data!.workflow, data!.commit);
        return {
          name: data!.assignmentName,
          repoName: data!.repoName,
          status,
          lastCommitDate: data!.commit?.commit?.author?.date,
          lastCommitMessage: data!.commit?.commit?.message?.split('\n')[0],
          workflowStatus: data!.workflow?.conclusion,
        };
      });

      const completedCount = assignments.filter(a => a.status === 'success').length;
      const totalAssignments = 14;
      const progressPercentage = Math.round((completedCount / totalAssignments) * 100);

      let studentStatus: Student['status'] = 'in_progress';
      if (completedCount === totalAssignments) {
        studentStatus = 'passed';
      } else if (assignments.some(a => a.status === 'failure')) {
        studentStatus = 'failed';
      }

      const lastActive = assignments
        .map(a => a.lastCommitDate)
        .filter(d => d)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

      students.push({
        id: username,
        username,
        name: username.charAt(0).toUpperCase() + username.slice(1),
        avatarUrl: studentRepoData[0]?.avatarUrl || '',
        assignments,
        completedCount,
        totalAssignments,
        progressPercentage,
        lastActive,
        status: studentStatus,
      });

      processed++;
      if (onProgress) {
        onProgress(processed, studentUsernames.length);
      }
    }

    // Sort by name
    students.sort((a, b) => a.name.localeCompare(b.name));

    return students;
  }

  async getStudentDetails(username: string): Promise<StudentDetails | null> {
    const repos = await this.getOrganizationRepos();
    // Filter repos by extracting username from repo name
    const studentRepos = repos.filter(repo => this.extractUsernameFromRepo(repo.name) === username);

    if (studentRepos.length === 0) return null;

    // Build student info from repos (don't call getAllStudents - too slow!)
    const assignments: Assignment[] = [];

    for (const repo of studentRepos) {
      const assignmentName = this.parseAssignmentName(repo.name);
      if (!assignmentName) continue;

      const [workflow, commit] = await Promise.all([
        this.getWorkflowStatus(this.org, repo.name),
        this.getLatestCommit(this.org, repo.name),
      ]);

      const status = this.determineStatus(workflow, commit);

      assignments.push({
        name: assignmentName,
        repoName: repo.name,
        status,
        lastCommitDate: commit?.commit?.author?.date,
        lastCommitMessage: commit?.commit?.message?.split('\n')[0],
        workflowStatus: workflow?.conclusion,
      });
    }

    const completedCount = assignments.filter(a => a.status === 'success').length;
    const totalAssignments = 14;
    const progressPercentage = Math.round((completedCount / totalAssignments) * 100);

    let studentStatus: Student['status'] = 'in_progress';
    if (completedCount === totalAssignments) {
      studentStatus = 'passed';
    } else if (assignments.some(a => a.status === 'failure')) {
      studentStatus = 'failed';
    }

    const lastActive = assignments
      .map(a => a.lastCommitDate)
      .filter(d => d)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

    // Calculate commit activity (last 14 days)
    const commitActivity = new Array(14).fill(0);
    let totalCommits = 0;

    for (const repo of studentRepos) {
      try {
        const commits = await this.fetchWithAuth(
          `https://api.github.com/repos/${this.org}/${repo.name}/commits?per_page=100`
        );

        totalCommits += commits.length;

        // Count commits per day
        const now = new Date();
        for (const commit of commits) {
          const commitDate = new Date(commit.commit.author.date);
          const daysDiff = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff >= 0 && daysDiff < 14) {
            commitActivity[13 - daysDiff]++;
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch commits for ${repo.name}`);
      }
    }

    return {
      id: username,
      username,
      name: username.charAt(0).toUpperCase() + username.slice(1),
      avatarUrl: studentRepos[0]?.owner?.avatar_url || '',
      assignments,
      completedCount,
      totalAssignments,
      progressPercentage,
      lastActive,
      status: studentStatus,
      repos: studentRepos,
      commitActivity,
      totalCommits,
    };
  }

  clearCache() {
    this.cache.clear();
  }
}
