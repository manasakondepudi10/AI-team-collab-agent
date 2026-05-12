import { Octokit } from '@octokit/rest';
import { AppError } from '../../shared/errors.js';
import { env } from '../../config/env.js';
import { ProjectModel } from '../projects/project.model.js';
import { UserModel } from '../users/user.model.js';
import { GithubIntegrationModel } from './github-integration.model.js';
import { logActivity, notifyUsers } from './activity.service.js';

async function githubClientForUser(userId: string) {
  const user = await UserModel.findById(userId).select('+github.accessToken');
  const token = user?.github?.accessToken;
  if (!token) throw new AppError('Connect GitHub before using repository features', 400);
  return new Octokit({ auth: token, userAgent: env.GITHUB_APP_NAME });
}

async function withGithubRetry<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function listUserRepositories(userId: string) {
  const octokit = await githubClientForUser(userId);
  const repos = await withGithubRetry(() =>
    octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      visibility: 'all',
      affiliation: 'owner,collaborator,organization_member',
      sort: 'updated',
      per_page: 100
    })
  );

  return repos.map((repo) => ({
    id: String(repo.id),
    owner: repo.owner.login,
    repo: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch
  }));
}

export async function connectRepository(input: {
  projectId: string;
  userId: string;
  owner: string;
  repo: string;
  branch?: string;
}) {
  const octokit = await githubClientForUser(input.userId);
  const { data: repo } = await withGithubRetry(() =>
    octokit.repos.get({
      owner: input.owner,
      repo: input.repo
    })
  );

  const branch = input.branch || repo.default_branch || 'main';
  const integration = await GithubIntegrationModel.findOneAndUpdate(
    { project: input.projectId },
    {
      owner: input.owner,
      repo: input.repo,
      branch,
      githubRepoId: String(repo.id),
      isPrivate: repo.private,
      connectedBy: input.userId,
      syncStatus: 'idle',
      syncError: undefined
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ProjectModel.findByIdAndUpdate(input.projectId, {
    github: {
      owner: input.owner,
      repo: input.repo,
      branch,
      connectedAt: new Date()
    }
  });

  await logActivity({
    project: input.projectId,
    actor: input.userId,
    action: 'github.repository_connected',
    entityType: 'githubIntegration',
    entityId: integration._id,
    metadata: { owner: input.owner, repo: input.repo, branch }
  });

  return integration;
}

export async function syncCollaborators(projectId: string, userId: string) {
  const integration = await GithubIntegrationModel.findOne({ project: projectId });
  if (!integration) throw new AppError('Connect a repository first', 400);

  const octokit = await githubClientForUser(userId);
  const collaborators = await withGithubRetry(() =>
    octokit.paginate(octokit.repos.listCollaborators, {
      owner: integration.owner,
      repo: integration.repo,
      affiliation: 'all',
      per_page: 100
    })
  );

  integration.set('collaborators', collaborators.map((collaborator) => ({
    githubId: String(collaborator.id),
    username: collaborator.login.toLowerCase(),
    role: collaborator.permissions?.admin ? 'admin' : collaborator.permissions?.push ? 'push' : 'pull',
    invitationStatus: 'synced',
    lastSyncedAt: new Date()
  })));
  integration.lastSyncedAt = new Date();
  await integration.save();

  await logActivity({
    project: projectId,
    actor: userId,
    action: 'github.collaborators_synced',
    entityType: 'githubIntegration',
    entityId: integration._id,
    metadata: { count: integration.collaborators.length }
  });

  return integration;
}

export async function inviteCollaborator(input: {
  projectId: string;
  userId: string;
  usernameOrEmail: string;
  permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin';
}) {
  const integration = await GithubIntegrationModel.findOne({ project: input.projectId });
  if (!integration) throw new AppError('Connect a repository first', 400);

  const lookup = input.usernameOrEmail.trim().toLowerCase();
  const matchedUser = lookup.includes('@')
    ? await UserModel.findOne({ email: lookup })
    : await UserModel.findOne({ 'github.username': lookup });
  const username = lookup.includes('@') ? matchedUser?.github?.username : lookup;
  if (!username) throw new AppError('GitHub invitations require a GitHub username or a team member email with a connected GitHub account', 422);

  const octokit = await githubClientForUser(input.userId);
  await withGithubRetry(() =>
    octokit.repos.addCollaborator({
      owner: integration.owner,
      repo: integration.repo,
      username,
      permission: input.permission ?? 'push'
    })
  );

  const existing = integration.collaborators.find((collaborator) => collaborator.username === username);
  if (existing) {
    existing.invitationStatus = 'pending';
    existing.invitedAt = new Date();
    existing.role = input.permission ?? 'push';
  } else {
    integration.collaborators.push({
      username,
      role: input.permission ?? 'push',
      invitationStatus: 'pending',
      invitedAt: new Date()
    });
  }
  await integration.save();

  await logActivity({
    project: input.projectId,
    actor: input.userId,
    action: 'github.collaborator_invited',
    entityType: 'githubIntegration',
    entityId: integration._id,
    metadata: { username }
  });

  if (matchedUser) {
    await notifyUsers({
      recipients: [matchedUser._id],
      project: input.projectId,
      type: 'github_sync',
      title: 'GitHub repository invitation sent',
      message: `You were invited to ${integration.owner}/${integration.repo}.`,
      metadata: { username }
    });
  }

  return integration;
}

export async function repositoryTree(projectId: string, userId: string) {
  const integration = await GithubIntegrationModel.findOne({ project: projectId });
  if (!integration) throw new AppError('Connect a repository first', 400);

  const octokit = await githubClientForUser(userId);
  const branch = await withGithubRetry(() =>
    octokit.repos.getBranch({
      owner: integration.owner,
      repo: integration.repo,
      branch: integration.branch
    })
  );

  const tree = await withGithubRetry(() =>
    octokit.git.getTree({
      owner: integration.owner,
      repo: integration.repo,
      tree_sha: branch.data.commit.sha,
      recursive: 'true'
    })
  );

  return {
    integration,
    paths: new Set(tree.data.tree.map((item) => item.path).filter((path): path is string => Boolean(path))),
    tree: tree.data.tree
  };
}
