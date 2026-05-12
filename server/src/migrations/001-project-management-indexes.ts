import { connectDb } from '../config/db.js';
import { ActivityLogModel } from '../modules/project-management/activity.model.js';
import { AssignmentModel } from '../modules/project-management/assignment.model.js';
import { GithubIntegrationModel } from '../modules/project-management/github-integration.model.js';
import { GoalNodeModel } from '../modules/project-management/goal.model.js';
import { NotificationModel } from '../modules/project-management/notification.model.js';

const models = [GoalNodeModel, AssignmentModel, GithubIntegrationModel, ActivityLogModel, NotificationModel];

await connectDb();
for (const model of models) {
  await model.syncIndexes();
  console.log(`Synced indexes for ${model.modelName}`);
}

process.exit(0);
