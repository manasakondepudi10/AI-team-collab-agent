import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';

export type PlannerMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type TeamResource = {
  name: string;
  role?: string;
  skills: string[];
  availability?: string;
};

const architecturePlanSchema = z.object({
  projectName: z.string(),
  summary: z.string(),
  architectureStyle: z.enum(['monolith', 'modular_monolith', 'microservices', 'serverless', 'hybrid']),
  architectureReason: z.string(),
  recommendedStack: z.array(z.string()).min(1),
  modules: z.array(
    z.object({
      name: z.string(),
      responsibility: z.string(),
      ownerRole: z.string().optional()
    })
  ),
  dataModel: z.array(z.string()),
  apiPlan: z.array(z.string()),
  milestones: z.array(z.string()).min(1),
  risks: z.array(z.string()),
  nextQuestions: z.array(z.string())
});

export type ArchitecturePlan = z.infer<typeof architecturePlanSchema>;

const plannerResponseSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('question'),
    reply: z.string(),
    missingDetails: z.array(z.string()).default([])
  }),
  z.object({
    mode: z.literal('plan'),
    reply: z.string(),
    plan: architecturePlanSchema
  })
]);

export type PlannerResponse = z.infer<typeof plannerResponseSchema>;

function hasEnoughPlanningDetail(input: {
  projectBrief: string;
  teamSize?: number;
  teamResources: TeamResource[];
  messages: PlannerMessage[];
}) {
  const text = [input.projectBrief, ...input.messages.map((message) => message.content)].join(' ').toLowerCase();
  const hasProjectIntent = /\b(build|create|develop|app|platform|system|website|api|tool|project)\b/.test(text);
  const hasDomainDetail = text.replace(/\s+/g, ' ').trim().length >= 80;
  const hasTeamDetail = Boolean(input.teamSize || input.teamResources.length) || /\b(team|students|members|developers|frontend|backend|react|node|java|python|mongodb|sql)\b/.test(text);
  const hasConstraint = /\b(week|month|deadline|mvp|deploy|budget|users|scale|host|cloud|college|campus)\b/.test(text);
  return hasProjectIntent && hasDomainDetail && hasTeamDetail && hasConstraint;
}

function fallbackPlan(input: {
  projectBrief: string;
  teamSize?: number;
  teamResources: TeamResource[];
}): PlannerResponse {
  const hasBackend = input.teamResources.some((member) =>
    member.skills.some((skill) => /node|express|api|backend|spring|django|fastapi/i.test(skill))
  );
  const hasDevOps = input.teamResources.some((member) => member.skills.some((skill) => /docker|kubernetes|aws|devops|ci/i.test(skill)));
  const teamSize = input.teamSize ?? input.teamResources.length;
  const architectureStyle = teamSize >= 6 && hasDevOps ? 'microservices' : 'modular_monolith';

  return {
    mode: 'plan',
    reply: `${architectureStyle === 'microservices' ? 'Microservices' : 'Modular monolith'} looks like the right starting point based on what you shared.`,
    plan: {
      projectName: 'Project Plan',
      summary: input.projectBrief.slice(0, 240) || 'A structured project plan based on the current team and resource description.',
      architectureStyle,
      architectureReason:
        architectureStyle === 'microservices'
          ? 'The team appears large enough and has operational skills to split services with clear ownership.'
          : 'A modular monolith keeps development fast, simple to deploy, and easier for a small team to coordinate while preserving module boundaries.',
      recommendedStack: hasBackend ? ['React', 'Node.js', 'Express', 'MongoDB', 'Docker'] : ['React', 'Node.js', 'MongoDB'],
      modules: [
        { name: 'Auth and Users', responsibility: 'OAuth login, user profile, and session management.', ownerRole: 'Backend' },
        { name: 'Core Domain', responsibility: 'Main project workflows, entities, and business rules.', ownerRole: 'Backend' },
        { name: 'Dashboard UI', responsibility: 'Project planning views and collaboration interface.', ownerRole: 'Frontend' },
        { name: 'Integrations', responsibility: 'GitHub sync, webhooks, and external API connections.', ownerRole: 'Integration' }
      ],
      dataModel: ['User', 'Team', 'Project', 'Task', 'ProjectPlan', 'GitHubConnection'],
      apiPlan: ['POST /auth/github', 'POST /projects/plan/chat', 'POST /projects', 'GET /projects/:id', 'POST /github/projects/:id/sync'],
      milestones: ['Clarify requirements', 'Finalize architecture', 'Build MVP workflow', 'Add integrations', 'Test and demo'],
      risks: ['Scope may grow beyond team capacity', 'External API limits or token handling need care', 'Deployment complexity should match team skill level'],
      nextQuestions: ['What is the expected deadline?', 'How many active users do you expect?', 'Which features are must-have for MVP?']
    }
  };
}

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return content.slice(firstBrace, lastBrace + 1);
  return content;
}

export async function generateArchitecturePlan(input: {
  projectBrief: string;
  teamSize?: number;
  teamResources: TeamResource[];
  messages: PlannerMessage[];
}) {
  if (!hasEnoughPlanningDetail(input)) {
    return {
      mode: 'question' as const,
      reply:
        'Absolutely, I am ready. First tell me the project idea, target users, team size, each member tech stack, deadline, and where you plan to deploy it. After that I will suggest the architecture.',
      missingDetails: ['project idea', 'target users', 'team/resources', 'deadline', 'deployment constraints'],
      source: 'conversation' as const
    };
  }

  if (!env.GROQ_API_KEY) {
    return {
      ...fallbackPlan(input),
      source: 'fallback' as const,
      warning: 'GROQ_API_KEY is not configured. Add it in .env for AI-generated plans.'
    };
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a senior software architect for student project teams. You are conversational first. If enough project, team, deadline, and constraint details exist, return mode "plan". Return only valid JSON.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            requiredJsonShape: {
              mode: 'plan',
              reply: 'short conversational explanation',
              plan: {
                projectName: 'string',
                summary: 'string',
                architectureStyle: 'monolith | modular_monolith | microservices | serverless | hybrid',
                architectureReason: 'string',
                recommendedStack: ['string'],
                modules: [{ name: 'string', responsibility: 'string', ownerRole: 'string' }],
                dataModel: ['string'],
                apiPlan: ['string'],
                milestones: ['string'],
                risks: ['string'],
                nextQuestions: ['string']
              }
            },
            projectBrief: input.projectBrief,
            teamSize: input.teamSize,
            teamResources: input.teamResources,
            conversation: input.messages
          })
        }
      ]
    })
  });

  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  } | null;

  if (!response.ok) {
    throw new AppError(data?.error?.message ?? 'LLM planning request failed', response.status);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AppError('LLM returned an empty planning response', 502);

  const parsed = plannerResponseSchema.safeParse(JSON.parse(extractJson(content)));
  if (!parsed.success) throw new AppError('LLM returned a plan in an unexpected format', 502);

  return { ...parsed.data, source: 'llm' as const };
}
