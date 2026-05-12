import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../shared/errors.js';
import { validate } from '../../shared/validate.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { TeamModel } from '../teams/team.model.js';
import { AssignmentModel } from './assignment.model.js';
import { ActivityLogModel } from './activity.model.js';
import { GoalNodeModel, goalNodeTypes, goalStatuses, priorities } from './goal.model.js';
import { GithubIntegrationModel } from './github-integration.model.js';
import { NotificationModel } from './notification.model.js';
import { logActivity, notifyUsers } from './activity.service.js';
import { descendantIds, getGoalTree } from './goal-tree.service.js';
import { loadAccessibleProject, requireProjectManager } from './project-access.service.js';
import { connectRepository, inviteCollaborator, listUserRepositories, syncCollaborators } from './github-integration.service.js';
import { syncGoalProgress } from './progress.service.js';

export const projectManagementRouter = Router();
projectManagementRouter.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const createGoalSchema = z.object({
  params: z.object({ projectId: objectId }),
  body: z.object({
    title: z.string().min(1),
    type: z.enum(goalNodeTypes).default('task'),
    parentId: objectId.nullish(),
    assignedMembers: z.array(objectId).default([]),
    githubPath: z.string().default(''),
    description: z.string().default(''),
    priority: z.enum(priorities).default('medium'),
    deadline: z.string().datetime().optional(),
    requiredFiles: z.array(z.string().min(1)).default([]),
    order: z.number().int().min(0).default(0)
  })
});

const updateGoalSchema = z.object({
  params: z.object({ goalId: objectId }),
  body: z.object({
    title: z.string().min(1).optional(),
    type: z.enum(goalNodeTypes).optional(),
    parentId: objectId.nullish(),
    assignedMembers: z.array(objectId).optional(),
    githubPath: z.string().optional(),
    completionStatus: z.enum(goalStatuses).optional(),
    progressPercentage: z.number().min(0).max(100).optional(),
    manualProgressOverride: z.boolean().optional(),
    description: z.string().optional(),
    priority: z.enum(priorities).optional(),
    deadline: z.string().datetime().nullable().optional(),
    requiredFiles: z.array(z.string().min(1)).optional(),
    order: z.number().int().min(0).optional()
  })
});

const assignGoalSchema = z.object({
  params: z.object({ goalId: objectId }),
  body: z.object({
    assignedMemberIds: z.array(objectId).min(1),
    description: z.string().default(''),
    priority: z.enum(priorities).default('medium'),
    status: z.enum(goalStatuses).default('pending'),
    deadline: z.string().datetime().optional()
  })
});

const connectRepoSchema = z.object({
  params: z.object({ projectId: objectId }),
  body: z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    branch: z.string().optional()
  })
});

const inviteSchema = z.object({
  params: z.object({ projectId: objectId }),
  body: z.object({
    usernameOrEmail: z.string().min(1),
    permission: z.enum(['pull', 'triage', 'push', 'maintain', 'admin']).default('push')
  })
});

function ensureSameProject(goal: { project: unknown }, projectId: unknown) {
  if (String(goal.project) !== String(projectId)) throw new AppError('Goal does not belong to this project', 400);
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : String(value ?? '');
}

projectManagementRouter.get(
  '/projects/:projectId/goals',
  validate(z.object({ params: z.object({ projectId: objectId }) })),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await loadAccessibleProject(req, projectId);
    const goals = await GoalNodeModel.find({ project: projectId })
      .populate('assignedMembers', 'name email avatarUrl github.username')
      .sort({ parentId: 1, order: 1, createdAt: 1 });
    res.json({ goals, tree: await getGoalTree(projectId) });
  })
);

projectManagementRouter.post(
  '/projects/:projectId/goals',
  validate(createGoalSchema),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    const access = await requireProjectManager(req, projectId);
    if (req.body.parentId) {
      const parent = await GoalNodeModel.findById(req.body.parentId);
      if (!parent) throw new AppError('Parent goal not found', 404);
      ensureSameProject(parent, access.project._id);
    }

    const goal = await GoalNodeModel.create({
      ...req.body,
      project: access.project._id,
      deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
      createdBy: req.user?.id,
      updatedBy: req.user?.id
    });

    await logActivity({
      project: access.project._id,
      actor: req.user?.id,
      action: 'goal.created',
      entityType: 'goal',
      entityId: goal._id,
      metadata: { title: goal.title, type: goal.type }
    });

    res.status(201).json({ goal });
  })
);

projectManagementRouter.patch(
  '/goals/:goalId',
  validate(updateGoalSchema),
  asyncHandler(async (req, res) => {
    const goalId = routeParam(req.params.goalId);
    const goal = await GoalNodeModel.findById(goalId);
    if (!goal) throw new AppError('Goal not found', 404);
    await requireProjectManager(req, String(goal.project));

    if (req.body.parentId) {
      if (req.body.parentId === goalId) throw new AppError('A goal cannot be its own parent', 422);
      const parent = await GoalNodeModel.findById(req.body.parentId);
      if (!parent) throw new AppError('Parent goal not found', 404);
      ensureSameProject(parent, goal.project);
    }

    const patch = {
      ...req.body,
      deadline: req.body.deadline === null ? undefined : req.body.deadline ? new Date(req.body.deadline) : goal.deadline,
      updatedBy: req.user?.id
    };
    Object.assign(goal, patch);
    await goal.save();

    await logActivity({
      project: goal.project,
      actor: req.user?.id,
      action: 'goal.updated',
      entityType: 'goal',
      entityId: goal._id,
      metadata: { title: goal.title }
    });

    res.json({ goal });
  })
);

projectManagementRouter.delete(
  '/goals/:goalId',
  validate(z.object({ params: z.object({ goalId: objectId }) })),
  asyncHandler(async (req, res) => {
    const goalId = routeParam(req.params.goalId);
    const goal = await GoalNodeModel.findById(goalId);
    if (!goal) throw new AppError('Goal not found', 404);
    await requireProjectManager(req, String(goal.project));

    const ids = await descendantIds(goalId);
    await Promise.all([GoalNodeModel.deleteMany({ _id: { $in: ids } }), AssignmentModel.deleteMany({ goal: { $in: ids } })]);
    await logActivity({
      project: goal.project,
      actor: req.user?.id,
      action: 'goal.deleted',
      entityType: 'goal',
      entityId: goal._id,
      metadata: { title: goal.title, deletedCount: ids.length }
    });

    res.json({ deleted: ids.length });
  })
);

projectManagementRouter.post(
  '/goals/:goalId/assign',
  validate(assignGoalSchema),
  asyncHandler(async (req, res) => {
    const goal = await GoalNodeModel.findById(routeParam(req.params.goalId));
    if (!goal) throw new AppError('Goal not found', 404);
    const access = await requireProjectManager(req, String(goal.project));

    const team = access.team ?? (await TeamModel.findById(access.project.team));
    const allowedMembers = new Set((team?.members ?? []).map((member) => String(member.user)));
    const invalidAssignee = req.body.assignedMemberIds.find((id: string) => !allowedMembers.has(id));
    if (invalidAssignee) throw new AppError('Assigned member must belong to the project team', 422);

    goal.set('assignedMembers', req.body.assignedMemberIds);
    goal.priority = req.body.priority;
    goal.description = req.body.description || goal.description;
    goal.deadline = req.body.deadline ? new Date(req.body.deadline) : goal.deadline;
    goal.completionStatus = req.body.status;
    goal.set('updatedBy', req.user?.id);
    await goal.save();

    await AssignmentModel.deleteMany({ goal: goal._id, assignedTo: { $nin: req.body.assignedMemberIds } });
    const assignments = await Promise.all(
      req.body.assignedMemberIds.map((assignedTo: string) =>
        AssignmentModel.findOneAndUpdate(
          { goal: goal._id, assignedTo },
          {
            project: goal.project,
            goal: goal._id,
            assignedTo,
            assignedBy: req.user?.id,
            status: req.body.status,
            priority: req.body.priority,
            description: req.body.description,
            deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
            completedAt: req.body.status === 'completed' ? new Date() : undefined
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );

    await notifyUsers({
      recipients: req.body.assignedMemberIds,
      project: goal.project,
      goal: goal._id,
      type: 'assignment',
      title: 'New project assignment',
      message: `You were assigned to ${goal.title}.`,
      metadata: { priority: goal.priority }
    });
    await logActivity({
      project: goal.project,
      actor: req.user?.id,
      action: 'goal.assigned',
      entityType: 'goal',
      entityId: goal._id,
      metadata: { assignees: req.body.assignedMemberIds }
    });

    res.json({ goal, assignments });
  })
);

projectManagementRouter.get(
  '/projects/:projectId/assignments',
  validate(z.object({ params: z.object({ projectId: objectId }) })),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await loadAccessibleProject(req, projectId);
    const assignments = await AssignmentModel.find({ project: projectId })
      .populate('goal')
      .populate('assignedTo', 'name email avatarUrl github.username')
      .populate('assignedBy', 'name email');
    res.json({ assignments });
  })
);

projectManagementRouter.get(
  '/github/repositories',
  asyncHandler(async (req, res) => {
    res.json({ repositories: await listUserRepositories(req.user?.id ?? '') });
  })
);

projectManagementRouter.get(
  '/projects/:projectId/github/repository',
  validate(z.object({ params: z.object({ projectId: objectId }) })),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await loadAccessibleProject(req, projectId);
    const integration = await GithubIntegrationModel.findOne({ project: projectId });
    res.json({ integration });
  })
);

projectManagementRouter.post(
  '/projects/:projectId/github/repository',
  validate(connectRepoSchema),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await requireProjectManager(req, projectId);
    const integration = await connectRepository({
      projectId,
      userId: req.user?.id ?? '',
      owner: req.body.owner,
      repo: req.body.repo,
      branch: req.body.branch
    });
    res.json({ integration });
  })
);

projectManagementRouter.post(
  '/projects/:projectId/github/collaborators/sync',
  validate(z.object({ params: z.object({ projectId: objectId }) })),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await requireProjectManager(req, projectId);
    res.json({ integration: await syncCollaborators(projectId, req.user?.id ?? '') });
  })
);

projectManagementRouter.post(
  '/projects/:projectId/github/invite',
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await requireProjectManager(req, projectId);
    res.json({
      integration: await inviteCollaborator({
        projectId,
        userId: req.user?.id ?? '',
        usernameOrEmail: req.body.usernameOrEmail,
        permission: req.body.permission
      })
    });
  })
);

projectManagementRouter.post(
  '/projects/:projectId/progress/sync',
  validate(z.object({ params: z.object({ projectId: objectId }) })),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await loadAccessibleProject(req, projectId);
    res.json(await syncGoalProgress(projectId, req.user?.id ?? ''));
  })
);

projectManagementRouter.get(
  '/projects/:projectId/overview',
  validate(z.object({ params: z.object({ projectId: objectId }) })),
  asyncHandler(async (req, res) => {
    const projectId = routeParam(req.params.projectId);
    await loadAccessibleProject(req, projectId);
    const [goals, assignments, activities, integration] = await Promise.all([
      GoalNodeModel.find({ project: projectId }).populate('assignedMembers', 'name email avatarUrl github.username'),
      AssignmentModel.find({ project: projectId }).populate('assignedTo', 'name email avatarUrl github.username').populate('goal'),
      ActivityLogModel.find({ project: projectId }).populate('actor', 'name email avatarUrl').sort({ createdAt: -1 }).limit(25),
      GithubIntegrationModel.findOne({ project: projectId })
    ]);

    const averageProgress = goals.length
      ? Math.round(goals.reduce((sum, goal) => sum + goal.progressPercentage, 0) / goals.length)
      : 0;
    const statusCounts = goals.reduce<Record<string, number>>((counts, goal) => {
      counts[goal.completionStatus] = (counts[goal.completionStatus] ?? 0) + 1;
      return counts;
    }, {});
    const memberProgress = new Map<string, { member: unknown; total: number; done: number }>();
    for (const assignment of assignments) {
      const key = String(assignment.assignedTo?._id ?? assignment.assignedTo);
      const current = memberProgress.get(key) ?? { member: assignment.assignedTo, total: 0, done: 0 };
      current.total += 1;
      if (assignment.status === 'completed') current.done += 1;
      memberProgress.set(key, current);
    }

    res.json({
      overview: {
        totalGoals: goals.length,
        averageProgress,
        statusCounts,
        memberProgress: [...memberProgress.values()].map((entry) => ({
          ...entry,
          progress: entry.total ? Math.round((entry.done / entry.total) * 100) : 0
        })),
        health:
          averageProgress >= 80 ? 'on_track' : statusCounts.blocked ? 'blocked' : averageProgress >= 40 ? 'watch' : 'needs_attention'
      },
      goals,
      assignments,
      activities,
      integration
    });
  })
);

projectManagementRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const notifications = await NotificationModel.find({ recipient: req.user?.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ notifications });
  })
);

projectManagementRouter.patch(
  '/notifications/:notificationId/read',
  validate(z.object({ params: z.object({ notificationId: objectId }) })),
  asyncHandler(async (req, res) => {
    const notificationId = routeParam(req.params.notificationId);
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: notificationId, recipient: req.user?.id },
      { readAt: new Date() },
      { new: true }
    );
    if (!notification) throw new AppError('Notification not found', 404);
    res.json({ notification });
  })
);
