import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler, AppError } from '../../shared/errors.js';
import { validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { completeGithubRegistration, signToken } from '../auth/auth.service.js';
import { UserModel } from '../users/user.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { connectGithubAccount, exchangeGithubCode, githubConnectUrl, syncRepository, verifyGithubConnectState, verifyGithubSignature } from './github.service.js';

export const githubRouter = Router();

githubRouter.get(
  '/connect',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ url: githubConnectUrl(req.user?.id ?? '') });
  })
);

githubRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state) throw new AppError('Missing GitHub callback parameters', 400);

    try {
      const accessToken = await exchangeGithubCode(code);

      if (state.startsWith('signup:')) {
        const result = await completeGithubRegistration(state.slice('signup:'.length), accessToken);
        const params = new URLSearchParams({ token: result.token, github: 'registered' });
        return res.redirect(`${env.CLIENT_URL}/?${params.toString()}`);
      }

      if (state.startsWith('connect:')) {
        const userId = verifyGithubConnectState(state.slice('connect:'.length));
        await connectGithubAccount(userId, accessToken);
        const user = await UserModel.findById(userId);
        if (!user) throw new AppError('User not found', 404);
        const params = new URLSearchParams({ token: signToken(user), github: 'connected' });
        return res.redirect(`${env.CLIENT_URL}/?${params.toString()}`);
      }

      throw new AppError('Invalid GitHub callback state', 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub connection failed';
      const params = new URLSearchParams({ auth_error: message });
      return res.redirect(`${env.CLIENT_URL}/?${params.toString()}`);
    }
  })
);

githubRouter.post(
  '/projects/:id/sync',
  requireAuth,
  validate(z.object({ params: z.object({ id: z.string() }) })),
  asyncHandler(async (req, res) => {
    const stats = await syncRepository(String(req.params.id));
    res.json({ stats });
  })
);

githubRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    if (!verifyGithubSignature(rawBody, req.headers['x-hub-signature-256'] as string | undefined)) {
      throw new AppError('Invalid GitHub webhook signature', 401);
    }

    const payload = JSON.parse(rawBody.toString()) as {
      repository?: { owner?: { login?: string }; name?: string; html_url?: string };
      sender?: { login?: string };
      action?: string;
    };
    const event = String(req.headers['x-github-event'] ?? 'unknown');
    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;

    if (owner && repo) {
      await ProjectModel.updateOne(
        { 'github.owner': owner, 'github.repo': repo },
        {
          $push: {
            'github.events': {
              event,
              actor: payload.sender?.login,
              action: payload.action,
              url: payload.repository?.html_url,
              createdAt: new Date()
            }
          }
        }
      );
    }

    res.json({ ok: true });
  })
);
