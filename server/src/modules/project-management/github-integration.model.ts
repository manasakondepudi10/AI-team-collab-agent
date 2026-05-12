import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const collaboratorSchema = new Schema(
  {
    githubId: String,
    username: { type: String, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    role: { type: String, default: 'push' },
    invitationStatus: {
      type: String,
      enum: ['pending', 'accepted', 'failed', 'synced', 'unknown'],
      default: 'unknown'
    },
    invitedAt: Date,
    lastSyncedAt: Date
  },
  { _id: false }
);

const githubIntegrationSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, unique: true, index: true },
    owner: { type: String, required: true, trim: true },
    repo: { type: String, required: true, trim: true },
    branch: { type: String, default: 'main', trim: true },
    githubRepoId: String,
    isPrivate: { type: Boolean, default: false },
    connectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: { type: [collaboratorSchema], default: [] },
    syncStatus: { type: String, enum: ['idle', 'syncing', 'failed'], default: 'idle' },
    syncError: String,
    lastSyncedAt: Date
  },
  { timestamps: true }
);

githubIntegrationSchema.index({ owner: 1, repo: 1 });

export type GithubIntegration = InferSchemaType<typeof githubIntegrationSchema>;
export const GithubIntegrationModel = mongoose.model('GithubIntegration', githubIntegrationSchema);
