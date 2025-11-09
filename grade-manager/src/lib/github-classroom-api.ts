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

  constructor(token: string, org: string = 'nvnacs50') {
    this.token = token;
    this.org = org;
    this.cache = new Map();
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

    // Try to match against known assignments
    for (const assignment of CS50_ASSIGNMENTS) {
      if (cleaned.includes(assignment.name)) {
        return assignment.name;
      }
      if (assignment.alternativeNames) {
        for (const alt of assignment.alternativeNames) {
          if (cleaned.includes(alt)) {
            return assignment.name;
          }
        }
      }
    }

    // If no match, try to extract assignment name before username
    const parts = cleaned.split('-');
    if (parts.length >= 2) {
      return parts[0];
    }

    return null;
  }

  private extractUsername(repoName: string): string {
    const lower = repoName.toLowerCase();

    // Remove org prefix
    let cleaned = lower.replace(/^nvnacs50-/i, '');

    // Find assignment name
    const assignmentName = this.parseAssignmentName(repoName);

    if (assignmentName) {
      // Remove assignment name to get username
      const parts = cleaned.split('-');
      const assignmentIndex = parts.findIndex(p => p.includes(assignmentName.split('-')[0]));

      if (assignmentIndex !== -1 && parts.length > assignmentIndex + 1) {
        return parts.slice(assignmentIndex + 1).join('-');
      }
    }

    // Fallback: take last part
    const parts = cleaned.split('-');
    return parts[parts.length - 1];
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

    // Group repos by student
    const studentReposMap = new Map<string, any[]>();

    for (const repo of repos) {
      const username = this.extractUsername(repo.name);
      if (!studentReposMap.has(username)) {
        studentReposMap.set(username, []);
      }
      studentReposMap.get(username)!.push(repo);
    }

    // Fetch details for each student with batching
    const students: Student[] = [];
    const studentUsernames = Array.from(studentReposMap.keys());
    let processed = 0;

    for (const username of studentUsernames) {
      const repos = studentReposMap.get(username)!;
      const assignments: Assignment[] = [];

      // Fetch workflow and commit data in parallel
      const assignmentPromises = repos.map(async (repo) => {
        const assignmentName = this.parseAssignmentName(repo.name);
        if (!assignmentName) return null;

        const [workflow, commit] = await Promise.all([
          this.getWorkflowStatus(this.org, repo.name),
          this.getLatestCommit(this.org, repo.name),
        ]);

        const status = this.determineStatus(workflow, commit);

        return {
          name: assignmentName,
          repoName: repo.name,
          status,
          lastCommitDate: commit?.commit?.author?.date,
          lastCommitMessage: commit?.commit?.message?.split('\n')[0],
          workflowStatus: workflow?.conclusion,
        } as Assignment;
      });

      const assignmentResults = await Promise.all(assignmentPromises);
      const validAssignments = assignmentResults.filter(a => a !== null) as Assignment[];
      assignments.push(...validAssignments);

      const completedCount = assignments.filter(a => a.status === 'success').length;
      const totalAssignments = 14; // CS50 has 14 assignments
      const progressPercentage = Math.round((completedCount / totalAssignments) * 100);

      // Determine overall student status
      let studentStatus: Student['status'] = 'in_progress';
      if (completedCount === totalAssignments) {
        studentStatus = 'passed';
      } else if (assignments.some(a => a.status === 'failure')) {
        studentStatus = 'failed';
      }

      // Get last active date
      const lastActive = assignments
        .map(a => a.lastCommitDate)
        .filter(d => d)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

      students.push({
        id: username,
        username,
        name: username.charAt(0).toUpperCase() + username.slice(1), // Capitalize
        avatarUrl: repos[0]?.owner?.avatar_url || '',
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
    const studentRepos = repos.filter(repo => this.extractUsername(repo.name) === username);

    if (studentRepos.length === 0) return null;

    // Get basic student info
    const students = await this.getAllStudents();
    const student = students.find(s => s.username === username);

    if (!student) return null;

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
      ...student,
      repos: studentRepos,
      commitActivity,
      totalCommits,
    };
  }

  clearCache() {
    this.cache.clear();
  }
}
