import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export const goalNodeTypes = ['folder', 'task', 'module'] as const;
export const goalStatuses = ['pending', 'in_progress', 'completed', 'blocked'] as const;
export const priorities = ['low', 'medium', 'high', 'critical'] as const;

const goalNodeSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: goalNodeTypes, required: true, default: 'task' },
    parentId: { type: Schema.Types.ObjectId, ref: 'GoalNode', default: null, index: true },
    assignedMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    githubPath: { type: String, trim: true, default: '' },
    completionStatus: { type: String, enum: goalStatuses, default: 'pending' },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    manualProgressOverride: { type: Boolean, default: false },
    description: { type: String, default: '' },
    priority: { type: String, enum: priorities, default: 'medium' },
    deadline: Date,
    requiredFiles: [{ type: String, trim: true }],
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

goalNodeSchema.index({ project: 1, parentId: 1, order: 1 });
goalNodeSchema.index({ project: 1, githubPath: 1 });
goalNodeSchema.index({ assignedMembers: 1 });

export type GoalNode = InferSchemaType<typeof goalNodeSchema>;
export const GoalNodeModel = mongoose.model('GoalNode', goalNodeSchema);
