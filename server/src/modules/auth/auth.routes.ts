import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/errors.js';
import { validate } from '../../shared/validate.js';
import { githubLoginUrl } from '../github/github.service.js';
import { UserModel } from '../users/user.model.js';
import { requireAuth } from './auth.middleware.js';
import { loginUser, setUserPassword } from './auth.service.js';

export const authRouter = Router();

const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    githubUsername: z.string().min(1).optional(),
    password: z.string().min(1)
  }).refine((body) => body.identifier || body.email || body.githubUsername, {
    message: 'Email or GitHub username is required',
    path: ['identifier']
  })
});

const setPasswordSchema = z.object({
  body: z.object({
    password: z.string().min(8)
  })
});

authRouter.get(
  '/github',
  asyncHandler(async (_req, res) => {
    res.json({ url: githubLoginUrl() });
  })
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const identifier = req.body.identifier ?? req.body.email ?? req.body.githubUsername;
    res.json(await loginUser(identifier, req.body.password));
  })
);

authRouter.post(
  '/set-password',
  requireAuth,
  validate(setPasswordSchema),
  asyncHandler(async (req, res) => {
    res.json(await setUserPassword(req.user?.id ?? '', req.body.password));
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user?.id);
    res.json({ user });
  })
);
