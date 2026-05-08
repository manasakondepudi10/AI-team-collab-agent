import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const teamMemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'Student' },
    skills: [{ name: String, level: Number }],
    allocation: { type: Number, min: 0, max: 100, default: 100 },
    joinedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const teamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [teamMemberSchema], default: [] }
  },
  { timestamps: true }
);

export type Team = InferSchemaType<typeof teamSchema>;
export const TeamModel = mongoose.model('Team', teamSchema);
