import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { githubOAuthUrl, getGithubIdentity } from '../github/github.service.js';
import { sendVerificationEmail } from '../notifications/email.service.js';
import { UserModel } from '../users/user.model.js';
import { PendingRegistrationModel } from './pending-registration.model.js';

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

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  skills?: { name: string; level: number }[];
}) {
  const existing = await UserModel.findOne({ email: input.email });
  if (existing) throw new AppError('Email is already registered', 409);

  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    skills: input.skills ?? []
  });

  return { user: publicUser(user), token: signToken(user) };
}

export async function loginUser(identifier: string, password: string) {
  const normalized = normalizeIdentifier(identifier);
  const user = await UserModel.findOne({
    $or: [{ email: normalized }, { 'github.username': normalized }]
  }).select('+passwordHash');

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Invalid login or password', 401);
  }

  return { user: publicUser(user), token: signToken(user) };
}

export async function startGithubRegistration(input: {
  name: string;
  email: string;
  password: string;
  githubUsername: string;
  skills?: { name: string; level: number }[];
}) {
  const email = input.email.trim().toLowerCase();
  const githubUsername = normalizeIdentifier(input.githubUsername);

  const existing = await UserModel.findOne({
    $or: [{ email }, { 'github.username': githubUsername }]
  });
  if (existing) throw new AppError('A user already exists with that email or GitHub username', 409);

  const state = nanoid(32);
  const otp = makeOtp();
  const now = Date.now();
  await PendingRegistrationModel.findOneAndUpdate(
    { email },
    {
      state,
      name: input.name,
      email,
      githubUsername,
      passwordHash: await bcrypt.hash(input.password, 12),
      emailOtpHash: await bcrypt.hash(otp, 12),
      emailOtpExpiresAt: new Date(now + env.EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000),
      emailVerifiedAt: undefined,
      skills: input.skills ?? [],
      expiresAt: new Date(now + 30 * 60 * 1000)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const emailDelivery = await sendVerificationEmail({ to: email, name: input.name, code: otp });

  return {
    state,
    requiresEmailVerification: true,
    emailDelivery,
    expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES
  };
}

export async function verifyRegistrationEmail(input: { state: string; code: string }) {
  const pending = await PendingRegistrationModel.findOne({ state: input.state });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    throw new AppError('Registration session expired. Please start again.', 400);
  }

  if (pending.emailOtpExpiresAt.getTime() < Date.now()) {
    throw new AppError('Verification code expired. Please start registration again.', 400);
  }

  if (!(await bcrypt.compare(input.code.trim(), pending.emailOtpHash))) {
    throw new AppError('Invalid verification code', 401);
  }

  pending.emailVerifiedAt = new Date();
  await pending.save();

  return {
    url: githubOAuthUrl(`signup:${pending.state}`)
  };
}

export async function completeGithubRegistration(state: string, accessToken: string) {
  const pending = await PendingRegistrationModel.findOne({ state });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    throw new AppError('Registration session expired. Please start again.', 400);
  }

  if (!pending.emailVerifiedAt) {
    throw new AppError('Email must be verified before connecting GitHub', 403);
  }

  const existing = await UserModel.findOne({
    $or: [{ email: pending.email }, { 'github.username': pending.githubUsername }]
  });
  if (existing) throw new AppError('A user already exists with that email or GitHub username', 409);

  const identity = await getGithubIdentity(accessToken);
  if (identity.profile.login.toLowerCase() !== pending.githubUsername) {
    throw new AppError(`GitHub account mismatch. Expected @${pending.githubUsername}, got @${identity.profile.login}.`, 403);
  }

  const verifiedEmail = identity.emails.find((email) => email.email.toLowerCase() === pending.email && email.verified);
  if (!verifiedEmail) {
    throw new AppError('GitHub did not confirm that this email belongs to the account. Use a verified email from GitHub.', 403);
  }

  const user = await UserModel.create({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
    skills: pending.skills,
    avatarUrl: identity.profile.avatar_url,
    github: {
      username: identity.profile.login.toLowerCase(),
      email: verifiedEmail.email.toLowerCase(),
      emailVerifiedAt: new Date(),
      accessToken,
      connectedAt: new Date()
    }
  });

  await PendingRegistrationModel.deleteOne({ _id: pending._id });
  return { user: publicUser(user), token: signToken(user) };
}
