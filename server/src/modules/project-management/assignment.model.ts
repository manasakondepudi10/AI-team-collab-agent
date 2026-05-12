import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { goalStatuses, priorities } from './goal.model.js';

const assignmentSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    goal: { type: Schema.Types.ObjectId, ref: 'GoalNode', required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: goalStatuses, default: 'pending' },
    priority: { type: String, enum: priorities, default: 'medium' },
    description: { type: String, default: '' },
    deadline: Date,
    completedAt: Date
  },
  { timestamps: true }
);

assignmentSchema.index({ project: 1, assignedTo: 1, status: 1 });
assignmentSchema.index({ goal: 1, assignedTo: 1 }, { unique: true });

export type Assignment = InferSchemaType<typeof assignmentSchema>;
export const AssignmentModel = mongoose.model('Assignment', assignmentSchema);
