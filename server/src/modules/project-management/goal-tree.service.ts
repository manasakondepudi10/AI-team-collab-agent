import { Types } from 'mongoose';
import { GoalNodeModel } from './goal.model.js';

export type GoalTreeNode = Awaited<ReturnType<typeof getGoalTree>>[number];

export async function getGoalTree(projectId: string) {
  const goals = await GoalNodeModel.find({ project: projectId })
    .populate('assignedMembers', 'name email avatarUrl github.username')
    .sort({ parentId: 1, order: 1, createdAt: 1 });

  const plainGoals = goals.map((goal) => goal.toObject());
  const byParent = new Map<string, typeof plainGoals>();

  for (const goal of plainGoals) {
    const key = goal.parentId ? String(goal.parentId) : 'root';
    byParent.set(key, [...(byParent.get(key) ?? []), goal]);
  }

  type TreeGoal = (typeof plainGoals)[number] & { children: TreeGoal[] };
  const attachChildren = (parentKey: string): TreeGoal[] =>
    (byParent.get(parentKey) ?? []).map((goal) => ({
      ...goal,
      children: attachChildren(String(goal._id))
    }));

  return attachChildren('root');
}

export async function descendantIds(goalId: string) {
  const ids: Types.ObjectId[] = [new Types.ObjectId(goalId)];
  const queue = [goalId];

  while (queue.length) {
    const current = queue.shift();
    const children = await GoalNodeModel.find({ parentId: current }).select('_id');
    for (const child of children) {
      ids.push(child._id);
      queue.push(String(child._id));
    }
  }

  return ids;
}
