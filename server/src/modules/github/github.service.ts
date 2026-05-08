import crypto from 'node:crypto';
import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { ProjectModel } from '../projects/project.model.js';
import { UserModel } from '../users/user.model.js';

export function githubOAuthUrl(state: string) {
  if (!env.GITHUB_CLIENT_ID) throw new AppError('GitHub OAuth is not configured', 503);
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.API_URL}/api/github/callback`,
    scope: 'read:user repo user:email',
    state
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function githubConnectUrl(userId: string) {
  const state = jwt.sign({ sub: userId, purpose: 'github-connect' }, env.JWT_SECRET, { expiresIn: '10m' });
  return githubOAuthUrl(`connect:${state}`);
}

export function verifyGithubConnectState(state: string) {
  const payload = jwt.verify(state, env.JWT_SECRET) as { sub?: string; purpose?: string };
  if (payload.purpose !== 'github-connect' || !payload.sub) throw new AppError('Invalid GitHub connect session', 400);
  return payload.sub;
}

export async function exchangeGithubCode(code: string) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new AppError('GitHub OAuth is not configured', 503);
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.API_URL}/api/github/callback`
    })
  });

  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new AppError(data.error_description ?? 'Could not connect GitHub account', 400);
  return data.access_token;
}

export async function getGithubIdentity(token: string) {
  const octokit = new Octokit({ auth: token, userAgent: env.GITHUB_APP_NAME });
  const [{ data: profile }, { data: emails }] = await Promise.all([
    octokit.users.getAuthenticated(),
    octokit.users.listEmailsForAuthenticatedUser()
  ]);

  return { profile, emails };
}

export async function connectGithubAccount(userId: string, token: string) {
  const identity = await getGithubIdentity(token);
  const username = identity.profile.login.toLowerCase();
  const verifiedPrimary = identity.emails.find((email) => email.primary && email.verified) ?? identity.emails.find((email) => email.verified);
  const existing = await UserModel.findOne({ _id: { $ne: userId }, 'github.username': username });
  if (existing) throw new AppError(`GitHub account @${username} is already connected to another user`, 409);

  await UserModel.findByIdAndUpdate(userId, {
    github: {
      username,
      email: verifiedPrimary?.email.toLowerCase(),
      emailVerifiedAt: verifiedPrimary ? new Date() : undefined,
      accessToken: token,
      connectedAt: new Date()
    },
    avatarUrl: identity.profile.avatar_url
  });
  return identity.profile;
}

export function verifyGithubSignature(rawBody: Buffer, signature: string | undefined) {
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function syncRepository(projectId: string, accessToken?: string) {
  const project = await ProjectModel.findById(projectId);
  if (!project?.github?.owner || !project.github.repo) throw new AppError('Project repository is not connected', 400);

  const token = accessToken || (await UserModel.findById(project.owner).select('+github.accessToken'))?.github?.accessToken;
  if (!token) throw new AppError('GitHub account is not connected', 400);

  const octokit = new Octokit({ auth: token, userAgent: env.GITHUB_APP_NAME });
  const [contributors, pulls, commits] = await Promise.all([
    octokit.repos.listContributors({ owner: project.github.owner, repo: project.github.repo, per_page: 20 }),
    octokit.pulls.list({ owner: project.github.owner, repo: project.github.repo, state: 'all', per_page: 100 }),
    octokit.repos.listCommits({ owner: project.github.owner, repo: project.github.repo, per_page: 100 })
  ]);

  project.set('github.stats', {
    commits: commits.data.length,
    pullRequests: pulls.data.length,
    mergedPullRequests: pulls.data.filter((pull) => pull.merged_at).length,
    openPullRequests: pulls.data.filter((pull) => pull.state === 'open').length,
    lastSyncedAt: new Date(),
    contributors: contributors.data.map((contributor) => ({
      login: contributor.login,
      commits: contributor.contributions,
      additions: 0,
      deletions: 0,
      avatarUrl: contributor.avatar_url
    }))
  });

  await project.save();
  return project.github.stats;
}
