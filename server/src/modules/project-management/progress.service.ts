import { GoalNodeModel } from './goal.model.js';
import { GithubIntegrationModel } from './github-integration.model.js';
import { repositoryTree } from './github-integration.service.js';
import { logActivity, notifyUsers } from './activity.service.js';

function normalizePath(path?: string | null) {
  return (path ?? '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function childAverage(goalId: string, progressByGoal: Map<string, number>) {
  const childValues = [...progressByGoal.entries()]
    .filter(([key]) => key.startsWith(`${goalId}:child:`))
    .map(([, value]) => value);
  if (!childValues.length) return undefined;
  return Math.round(childValues.reduce((sum, value) => sum + value, 0) / childValues.length);
}

export async function syncGoalProgress(projectId: string, userId: string) {
  const { paths } = await repositoryTree(projectId, userId);
  const normalizedPaths = new Set([...paths].map(normalizePath));
  const goals = await GoalNodeModel.find({ project: projectId }).sort({ parentId: -1, createdAt: -1 });
  const progressByGoal = new Map<string, number>();
  const completedRecipients = new Set<string>();

  for (const goal of goals) {
    if (goal.manualProgressOverride) {
      progressByGoal.set(String(goal._id), goal.progressPercentage);
      continue;
    }

    const path = normalizePath(goal.githubPath);
    let nextProgress = goal.progressPercentage;

    if (path) {
      const exactExists = normalizedPaths.has(path);
      const descendantsExist = [...normalizedPaths].some((candidate) => candidate.startsWith(`${path}/`));
      const requiredFiles = (goal.requiredFiles ?? []).map((file) => normalizePath(`${path}/${file}`));
      const requiredFilesMet = requiredFiles.length
        ? requiredFiles.filter((file) => normalizedPaths.has(file)).length / requiredFiles.length
        : 0;

      if (exactExists || descendantsExist) nextProgress = Math.max(nextProgress, 50);
      if (requiredFiles.length) nextProgress = Math.max(nextProgress, Math.round(50 + requiredFilesMet * 30));
      if (requiredFiles.length && requiredFilesMet === 1) nextProgress = 100;
      if (goal.type === 'task' && exactExists) nextProgress = 100;
    }

    const average = childAverage(String(goal._id), progressByGoal);
    if (typeof average === 'number') nextProgress = Math.max(nextProgress, average);

    nextProgress = Math.max(0, Math.min(100, nextProgress));
    const nextStatus = nextProgress >= 100 ? 'completed' : nextProgress > 0 ? 'in_progress' : goal.completionStatus;

    if (nextProgress !== goal.progressPercentage || nextStatus !== goal.completionStatus) {
      goal.progressPercentage = nextProgress;
      goal.completionStatus = nextStatus;
      goal.set('updatedBy', userId);
      await goal.save();
      if (nextStatus === 'completed') {
        for (const memberId of goal.assignedMembers ?? []) completedRecipients.add(String(memberId));
      }
    }

    progressByGoal.set(String(goal._id), nextProgress);
    if (goal.parentId) {
      progressByGoal.set(`${String(goal.parentId)}:child:${String(goal._id)}`, nextProgress);
    }
  }

  const integration = await GithubIntegrationModel.findOneAndUpdate(
    { project: projectId },
    { lastSyncedAt: new Date(), syncStatus: 'idle', syncError: undefined },
    { new: true }
  );

  await logActivity({
    project: projectId,
    actor: userId,
    action: 'github.progress_synced',
    entityType: 'githubIntegration',
    entityId: integration?._id,
    metadata: { updatedGoals: goals.length }
  });

  await notifyUsers({
    recipients: [...completedRecipients],
    project: projectId,
    type: 'completion',
    title: 'Assigned work completed from GitHub sync',
    message: 'One of your assigned goals reached 100% based on repository structure.',
    metadata: { projectId }
  });

  return {
    updatedGoals: goals.length,
    lastSyncedAt: integration?.lastSyncedAt ?? new Date()
  };
}
