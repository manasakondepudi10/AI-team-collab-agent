import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { UserModel } from '../users/user.model.js';
import { asyncHandler, AppError } from '../../shared/errors.js';
import { validate } from '../../shared/validate.js';
import { TeamModel } from './team.model.js';

export const teamRouter = Router();
teamRouter.use(requireAuth);

const createTeamSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    members: z
      .array(
        z.object({
          email: z.string().email(),
          name: z.string().min(2),
          title: z.string().optional(),
          skills: z.array(z.object({ name: z.string(), level: z.number().min(1).max(5) })).default([])
        })
      )
      .default([])
  })
});

teamRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const teams = await TeamModel.find({ $or: [{ owner: req.user?.id }, { 'members.user': req.user?.id }] }).populate('members.user', 'name email avatarUrl skills github.username');
    res.json({ teams });
  })
);

teamRouter.post(
  '/',
  validate(createTeamSchema),
  asyncHandler(async (req, res) => {
    const currentUser = await UserModel.findById(req.user?.id);
    if (!currentUser) throw new AppError('User not found', 404);

    const members = [
      { user: currentUser._id, title: 'Project Lead', skills: currentUser.skills, allocation: 100 },
      ...(await Promise.all(
        req.body.members.map(async (member: { email: string; name: string; title?: string; skills: { name: string; level: number }[] }) => {
          const user =
            (await UserModel.findOne({ email: member.email })) ??
            (await UserModel.create({
              name: member.name,
              email: member.email,
              passwordHash: '$2a$12$wTdbqZ9oB3FrqsYV9q/2reQ5a2fWbLhAjrC4hW31puZR.kpQxSAFO',
              skills: member.skills
            }));
          return { user: user._id, title: member.title ?? 'Student', skills: member.skills, allocation: 100 };
        })
      ))
    ];

    const team = await TeamModel.create({ name: req.body.name, description: req.body.description, owner: req.user?.id, members });
    res.status(201).json({ team });
  })
);
