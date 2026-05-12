import type { Request } from 'express';
import { AppError } from '../../shared/errors.js';
import { ProjectModel } from '../projects/project.model.js';
import { TeamModel } from '../teams/team.model.js';

export async function loadAccessibleProject(req: Request, projectId: string) {
  const project = await ProjectModel.findById(projectId);
  if (!project) throw new AppError('Project not found', 404);

  const team = await TeamModel.findById(project.team);
  const isOwner = String(project.owner) === req.user?.id;
  const isTeamMember = team?.members.some((member) => String(member.user) === req.user?.id) ?? false;
  const isAdmin = req.user?.role === 'admin';

  if (!isOwner && !isTeamMember && !isAdmin) {
    throw new AppError('You do not have access to this project', 403);
  }

  return { project, team, isOwner, isAdmin, canManage: isOwner || isAdmin };
}

export async function requireProjectManager(req: Request, projectId: string) {
  const access = await loadAccessibleProject(req, projectId);
  if (!access.canManage) throw new AppError('Only the project owner or an admin can perform this action', 403);
  return access;
}
