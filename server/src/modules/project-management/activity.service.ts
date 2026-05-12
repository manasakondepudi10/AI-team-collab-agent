import { ActivityLogModel } from './activity.model.js';
import { NotificationModel } from './notification.model.js';

export async function logActivity(input: {
  project: unknown;
  actor?: unknown;
  action: string;
  entityType: string;
  entityId?: unknown;
  metadata?: Record<string, unknown>;
}) {
  return ActivityLogModel.create(input);
}

export async function notifyUsers(input: {
  recipients: unknown[];
  project?: unknown;
  goal?: unknown;
  type: 'assignment' | 'github_sync' | 'deadline' | 'completion' | 'system';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const uniqueRecipients = [...new Set(input.recipients.map(String))];
  if (!uniqueRecipients.length) return [];

  return NotificationModel.insertMany(
    uniqueRecipients.map((recipient) => ({
      recipient,
      project: input.project,
      goal: input.goal,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ?? {}
    }))
  );
}
