// GitHub API Client

class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
  }

  // Make authenticated request to GitHub API
  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    return await response.json();
  }

  // Get all repositories for the authenticated user
  async getMyRepos() {
    const repos = await this.request('/user/repos?affiliation=owner,collaborator&per_page=100');
    return repos;
  }

  // Get repositories that match GitHub Classroom pattern
  async getClassroomRepos() {
    const allRepos = await this.getMyRepos();

    // Filter based on organization or naming pattern
    return allRepos.filter(repo => {
      // If organization is specified, only show repos from that org
      if (CONFIG.GITHUB_CLASSROOM_ORG) {
        return repo.owner.login === CONFIG.GITHUB_CLASSROOM_ORG;
      }

      // Otherwise filter by naming pattern
      return CONFIG.ASSIGNMENT_REPO_PATTERN.test(repo.name);
    });
  }

  // Get commits for a repository
  async getRepoCommits(owner, repo, perPage = 10) {
    try {
      const commits = await this.request(`/repos/${owner}/${repo}/commits?per_page=${perPage}`);
      return commits;
    } catch (error) {
      console.warn(`Failed to fetch commits for ${owner}/${repo}:`, error);
      return [];
    }
  }

  // Get latest commit for a repository
  async getLatestCommit(owner, repo) {
    const commits = await this.getRepoCommits(owner, repo, 1);
    return commits[0] || null;
  }

  // Get GitHub Actions workflow runs for a repository
  async getWorkflowRuns(owner, repo) {
    try {
      const data = await this.request(`/repos/${owner}/${repo}/actions/runs?per_page=10`);
      return data.workflow_runs || [];
    } catch (error) {
      console.warn(`Failed to fetch workflow runs for ${owner}/${repo}:`, error);
      return [];
    }
  }

  // Get latest workflow run
  async getLatestWorkflowRun(owner, repo) {
    const runs = await this.getWorkflowRuns(owner, repo);
    return runs[0] || null;
  }

  // Get repository details with extra info
  async getRepoDetails(repo) {
    try {
      const [latestCommit, latestRun] = await Promise.all([
        this.getLatestCommit(repo.owner.login, repo.name),
        this.getLatestWorkflowRun(repo.owner.login, repo.name)
      ]);

      return {
        ...repo,
        latestCommit,
        latestRun,
        status: this.determineRepoStatus(latestCommit, latestRun)
      };
    } catch (error) {
      console.error(`Failed to get details for ${repo.name}:`, error);
      return {
        ...repo,
        latestCommit: null,
        latestRun: null,
        status: 'unknown'
      };
    }
  }

  // Determine repository status based on commits and workflow runs
  determineRepoStatus(latestCommit, latestRun) {
    if (!latestCommit) {
      return 'not_started'; // No commits yet
    }

    if (!latestRun) {
      return 'no_tests'; // Has commits but no workflow runs
    }

    // Check workflow conclusion
    switch (latestRun.conclusion) {
      case 'success':
        return 'success';
      case 'failure':
        return 'failure';
      case 'cancelled':
        return 'cancelled';
      default:
        if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
          return 'in_progress';
        }
        return 'unknown';
    }
  }

  // Get all assignment details
  async getAllAssignments() {
    const repos = await this.getClassroomRepos();

    // Fetch details for all repos in parallel
    const detailsPromises = repos.map(repo => this.getRepoDetails(repo));
    const assignments = await Promise.all(detailsPromises);

    return assignments;
  }

  // Get statistics
  getStatistics(assignments) {
    return {
      total: assignments.length,
      success: assignments.filter(a => a.status === 'success').length,
      failure: assignments.filter(a => a.status === 'failure').length,
      inProgress: assignments.filter(a => a.status === 'in_progress').length,
      notStarted: assignments.filter(a => a.status === 'not_started').length,
      noTests: assignments.filter(a => a.status === 'no_tests').length
    };
  }
}
