import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().default('mongodb://localhost:27017/ai_team_collab'),
  JWT_SECRET: z.string().min(16).default('local-development-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:5000'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().default('local-webhook-secret'),
  GITHUB_APP_NAME: z.string().default('ai-team-collab-agent'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().default(10)
});

export const env = envSchema.parse(process.env);
