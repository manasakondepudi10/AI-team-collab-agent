import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { getGithubIdentity } from '../github/github.service.js';
import { UserModel } from '../users/user.model.js';

export function signToken(user: { _id: unknown; role: string }) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  });
}

function publicUser(user: { toObject: () => Record<string, unknown> }) {
  const raw = user.toObject();
  const { passwordHash: _passwordHash, ...safeUser } = raw;
  return safeUser;
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function primaryVerifiedGithubEmail(
  emails: Awaited<ReturnType<typeof getGithubIdentity>>['emails'],
  fallbackUsername: string
) {
  const verified = emails.find((email) => email.primary && email.verified) ?? emails.find((email) => email.verified);
  return verified?.email.toLowerCase() ?? `${fallbackUsername}@users.noreply.github.com`;
}

export async function loginUser(identifier: string, password: string) {
  const normalized = normalizeIdentifier(identifier);
  const user = await UserModel.findOne({
    $or: [{ email: normalized }, { 'github.username': normalized }]
  }).select('+passwordHash');

  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Invalid login or password', 401);
  }

  return { user: publicUser(user), token: signToken(user) };
}

export async function setUserPassword(userId: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await UserModel.findByIdAndUpdate(userId, { passwordHash }, { new: true });
  if (!user) throw new AppError('User not found', 404);
  return { user: publicUser(user) };
}

export async function completeGithubLogin(accessToken: string) {
  const identity = await getGithubIdentity(accessToken);
  const githubId = String(identity.profile.id);
  const username = identity.profile.login.toLowerCase();
  const email = primaryVerifiedGithubEmail(identity.emails, username);

  let user = await UserModel.findOne({
    $or: [{ 'github.id': githubId }, { 'github.username': username }, { email }]
  });

  const github = {
    id: githubId,
    username,
    email,
    emailVerifiedAt: new Date(),
    accessToken,
    connectedAt: new Date()
  };

  if (!user) {
    user = await UserModel.create({
      name: identity.profile.name || username,
      email,
      avatarUrl: identity.profile.avatar_url,
      github
    });
  } else {
    user.name = user.name || identity.profile.name || username;
    user.email = user.email || email;
    user.avatarUrl = identity.profile.avatar_url;
    user.github = github;
    await user.save();
  }

  return { user: publicUser(user), token: signToken(user) };
}
