import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './shared/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { githubRouter } from './modules/github/github.routes.js';
import { projectManagementRouter } from './modules/project-management/project-management.routes.js';
import { projectRouter } from './modules/projects/project.routes.js';
import { teamRouter } from './modules/teams/team.routes.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(compression());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 400 }));

app.use('/api/github/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-team-collab-agent', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/teams', teamRouter);
app.use('/api/projects', projectRouter);
app.use('/api/github', githubRouter);
app.use('/api/project-management', projectManagementRouter);

app.use(notFound);
app.use(errorHandler);
