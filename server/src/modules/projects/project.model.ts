import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const generatedRoleSchema = new Schema(
  {
    role: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    reason: String
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    title: { type: String, required: true },
    description: String,
    status: { type: String, enum: ['todo', 'in_progress', 'review', 'done'], default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignee: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date
  },
  { timestamps: true }
);

const githubStatsSchema = new Schema(
  {
    commits: { type: Number, default: 0 },
    pullRequests: { type: Number, default: 0 },
    mergedPullRequests: { type: Number, default: 0 },
    openPullRequests: { type: Number, default: 0 },
    lastSyncedAt: Date,
    contributors: [
      {
        login: String,
        commits: Number,
        additions: Number,
        deletions: Number,
        avatarUrl: String
      }
    ]
  },
  { _id: false }
);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: {
      type: String,
      enum: ['web_app', 'mobile_app', 'api_service', 'data_science', 'iot', 'research'],
      required: true
    },
    status: { type: String, enum: ['planning', 'active', 'review', 'completed'], default: 'planning' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    dueDate: Date,
    structure: {
      stack: [String],
      folders: [String],
      workflow: [String],
      milestones: [String]
    },
    generatedRoles: { type: [generatedRoleSchema], default: [] },
    tasks: { type: [taskSchema], default: [] },
    github: {
      owner: String,
      repo: String,
      branch: { type: String, default: 'main' },
      installationId: String,
      webhookId: String,
      connectedAt: Date,
      stats: { type: githubStatsSchema, default: () => ({}) },
      events: [
        {
          event: String,
          actor: String,
          action: String,
          url: String,
          createdAt: { type: Date, default: Date.now }
        }
      ]
    }
  },
  { timestamps: true }
);

export type Project = InferSchemaType<typeof projectSchema>;
export const ProjectModel = mongoose.model('Project', projectSchema);
