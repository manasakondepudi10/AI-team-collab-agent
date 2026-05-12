import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const activityLogSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ project: 1, createdAt: -1 });

export type ActivityLog = InferSchemaType<typeof activityLogSchema>;
export const ActivityLogModel = mongoose.model('ActivityLog', activityLogSchema);
