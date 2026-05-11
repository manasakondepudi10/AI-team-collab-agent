import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler, AppError } from '../../shared/errors.js';
import { validate } from '../../shared/validate.js';
import { TeamModel } from '../teams/team.model.js';
import { ProjectModel } from './project.model.js';
import { generateProjectPlan } from './generator.js';
import { generateArchitecturePlan } from './planner.service.js';

export const projectRouter = Router();
projectRouter.use(requireAuth);

const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().min(10),
    type: z.enum(['web_app', 'mobile_app', 'api_service', 'data_science', 'iot', 'research']),
    teamId: z.string().min(1),
    dueDate: z.string().datetime().optional(),
    github: z
      .object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        branch: z.string().default('main')
      })
      .optional()
  })
});

const plannerChatSchema = z.object({
  body: z.object({
    projectBrief: z.string().min(1),
    teamSize: z.number().int().min(1).max(100).optional(),
    teamResources: z
      .array(
        z.object({
          name: z.string().min(1),
          role: z.string().optional(),
          skills: z.array(z.string().min(1)).default([]),
          availability: z.string().optional()
        })
      )
      .default([]),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().min(1)
        })
      )
      .default([])
  })
});

projectRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const projects = await ProjectModel.find({ $or: [{ owner: req.user?.id }, { team: { $in: req.user?.teamIds ?? [] } }] })
      .populate('team', 'name members')
      .populate('generatedRoles.user', 'name email avatarUrl github.username')
      .sort({ updatedAt: -1 });
    res.json({ projects });
  })
);

projectRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const projects = await ProjectModel.find({ $or: [{ owner: req.user?.id }, { team: { $in: req.user?.teamIds ?? [] } }] });
    const tasks = projects.flatMap((project) => project.tasks ?? []);
    const commits = projects.reduce((sum, project) => sum + (project.github?.stats?.commits ?? 0), 0);
    res.json({
      stats: {
        activeProjects: projects.filter((project) => ['planning', 'active', 'review'].includes(project.status)).length,
        completedTasks: tasks.filter((task) => task.status === 'done').length,
        totalTasks: tasks.length,
        commits,
        pullRequests: projects.reduce((sum, project) => sum + (project.github?.stats?.pullRequests ?? 0), 0)
      },
      recentProjects: projects.slice(0, 4)
    });
  })
);

projectRouter.post(
  '/plan/chat',
  validate(plannerChatSchema),
  asyncHandler(async (req, res) => {
    res.json(await generateArchitecturePlan(req.body));
  })
);

projectRouter.post(
  '/',
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    const team = await TeamModel.findOne({ _id: req.body.teamId, $or: [{ owner: req.user?.id }, { 'members.user': req.user?.id }] });
    if (!team) throw new AppError('Team not found or inaccessible', 404);

    const plan = generateProjectPlan(req.body.type, team);
    const project = await ProjectModel.create({
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      owner: req.user?.id,
      team: team._id,
      dueDate: req.body.dueDate,
      structure: plan.structure,
      generatedRoles: plan.generatedRoles,
      tasks: plan.tasks,
      github: req.body.github ? { ...req.body.github, connectedAt: new Date() } : undefined
    });

    res.status(201).json({ project });
  })
);

projectRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await ProjectModel.findById(req.params.id)
      .populate('team')
      .populate('generatedRoles.user', 'name email avatarUrl skills github.username')
      .populate('tasks.assignee', 'name email avatarUrl');
    if (!project) throw new AppError('Project not found', 404);
    res.json({ project });
  })
);
