import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/errors.js';
import { validate } from '../../shared/validate.js';
import { UserModel } from '../users/user.model.js';
import { requireAuth } from './auth.middleware.js';
import { loginUser, registerUser, startGithubRegistration, verifyRegistrationEmail } from './auth.service.js';

export const authRouter = Router();

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    skills: z.array(z.object({ name: z.string().min(1), level: z.number().min(1).max(5) })).optional()
  })
});

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

const githubRegisterSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    githubUsername: z.string().min(1),
    password: z.string().min(8),
    skills: z.array(z.object({ name: z.string().min(1), level: z.number().min(1).max(5) })).optional()
  })
});

const verifyRegistrationEmailSchema = z.object({
  body: z.object({
    state: z.string().min(1),
    code: z.string().regex(/^\d{6}$/)
  })
});

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body);
    res.status(201).json(result);
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
  '/register/github',
  validate(githubRegisterSchema),
  asyncHandler(async (req, res) => {
    res.status(202).json(await startGithubRegistration(req.body));
  })
);

authRouter.post(
  '/register/github/verify-email',
  validate(verifyRegistrationEmailSchema),
  asyncHandler(async (req, res) => {
    res.json(await verifyRegistrationEmail(req.body));
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
