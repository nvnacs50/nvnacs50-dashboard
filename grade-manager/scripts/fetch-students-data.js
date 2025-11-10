#!/usr/bin/env node

/**
 * GitHub Classroom Data Fetcher
 * Runs as GitHub Action to pre-generate student data cache
 *
 * This script mirrors the logic from github-classroom-api.ts
 * but runs in Node.js environment (not browser)
 */

const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORG_NAME = process.env.ORG_NAME || 'nvnacs50';

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

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

async function fetchWithAuth(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function getOrganizationRepos() {
  console.log(`📡 Fetching repos from org: ${ORG_NAME}...`);

  const repos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.github.com/orgs/${ORG_NAME}/repos?per_page=100&page=${page}&sort=updated`;
    const pageRepos = await fetchWithAuth(url);

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
    return !repoName.includes('dashboard') &&
           !repoName.includes('.github') &&
           !repoName.startsWith('.');
  });

  console.log(`✅ Found ${assignmentRepos.length} assignment repos`);
  return assignmentRepos;
}

function parseAssignmentName(repoName) {
  const lower = repoName.toLowerCase();
  let cleaned = lower.replace(/^nvnacs50-/i, '');

  const sortedAssignments = [...CS50_ASSIGNMENTS].sort((a, b) => {
    return b.name.length - a.name.length;
  });

  for (const assignment of sortedAssignments) {
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

  const parts = cleaned.split('-');
  if (parts.length >= 2) {
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

function extractUsernameFromRepo(repoName) {
  const lower = repoName.toLowerCase();
  let cleaned = lower.replace(/^nvnacs50-/i, '');

  const assignmentName = parseAssignmentName(repoName);
  if (!assignmentName) {
    return null;
  }

  if (cleaned.startsWith(assignmentName + '-')) {
    const username = cleaned.substring(assignmentName.length + 1);
    return username;
  }

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

async function getWorkflowStatus(repo) {
  try {
    const url = `https://api.github.com/repos/${ORG_NAME}/${repo}/actions/runs?per_page=1`;
    const data = await fetchWithAuth(url);
    return data.workflow_runs?.[0] || null;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch workflow for ${repo}`);
    return null;
  }
}

async function getLatestCommit(repo) {
  try {
    const url = `https://api.github.com/repos/${ORG_NAME}/${repo}/commits?per_page=1`;
    const commits = await fetchWithAuth(url);
    return commits[0] || null;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch commits for ${repo}`);
    return null;
  }
}

function determineStatus(workflow, commit) {
  if (!commit) return 'not_started';
  if (!workflow) return 'no_tests';

  if (workflow.status === 'in_progress' || workflow.status === 'queued') {
    return 'in_progress';
  }

  return workflow.conclusion === 'success' ? 'success' : 'failure';
}

async function batchPromises(items, promiseFn, batchSize = 50) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}...`);
    const batchResults = await Promise.all(batch.map(promiseFn));
    results.push(...batchResults);
  }

  return results;
}

async function getAllStudents() {
  const repos = await getOrganizationRepos();

  // Group repos by student
  const studentReposMap = new Map();

  for (const repo of repos) {
    const username = extractUsernameFromRepo(repo.name);
    if (!username) continue;

    if (!studentReposMap.has(username)) {
      studentReposMap.set(username, []);
    }
    studentReposMap.get(username).push(repo);
  }

  console.log(`👥 Found ${studentReposMap.size} students`);

  // Fetch workflow and commit data in batches
  console.log('📊 Fetching workflow and commit data...');
  const allRepoData = (await batchPromises(
    repos,
    async (repo) => {
      const assignmentName = parseAssignmentName(repo.name);
      if (!assignmentName) return null;

      const [workflow, commit] = await Promise.all([
        getWorkflowStatus(repo.name),
        getLatestCommit(repo.name),
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

  // Build student objects
  console.log('🏗️  Building student objects...');
  const students = [];
  const studentUsernames = Array.from(studentReposMap.keys());

  for (const username of studentUsernames) {
    const studentRepoData = allRepoData.filter(
      d => extractUsernameFromRepo(d.repoName) === username
    );

    const assignments = studentRepoData.map(data => {
      const status = determineStatus(data.workflow, data.commit);
      return {
        name: data.assignmentName,
        repoName: data.repoName,
        status,
        lastCommitDate: data.commit?.commit?.author?.date,
        lastCommitMessage: data.commit?.commit?.message?.split('\n')[0],
        workflowStatus: data.workflow?.conclusion,
      };
    });

    const completedCount = assignments.filter(a => a.status === 'success').length;
    const totalAssignments = 14;
    const progressPercentage = Math.round((completedCount / totalAssignments) * 100);

    let studentStatus = 'in_progress';
    if (completedCount === totalAssignments) {
      studentStatus = 'passed';
    } else if (assignments.some(a => a.status === 'failure')) {
      studentStatus = 'failed';
    }

    const lastActive = assignments
      .map(a => a.lastCommitDate)
      .filter(d => d)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

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
  }

  // Sort by name
  students.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`✅ Processed ${students.length} students`);
  return students;
}

async function main() {
  console.log('🚀 Starting GitHub Classroom data fetch...\n');

  try {
    const students = await getAllStudents();

    // Generate metadata
    const metadata = {
      timestamp: Date.now(),
      generatedAt: new Date().toISOString(),
      studentCount: students.length,
      totalRepos: students.reduce((sum, s) => sum + s.assignments.length, 0),
      version: '1.0.0',
    };

    // Ensure output directory exists
    const cacheDir = path.join(__dirname, '..', 'public', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Write files
    const studentsPath = path.join(cacheDir, 'students.json');
    const metadataPath = path.join(cacheDir, 'metadata.json');

    fs.writeFileSync(studentsPath, JSON.stringify(students, null, 2));
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`\n✅ Successfully wrote cache files:`);
    console.log(`   📄 ${studentsPath}`);
    console.log(`   📄 ${metadataPath}`);
    console.log(`\n📊 Stats:`);
    console.log(`   Students: ${metadata.studentCount}`);
    console.log(`   Total Repos: ${metadata.totalRepos}`);
    console.log(`   Generated: ${metadata.generatedAt}`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
