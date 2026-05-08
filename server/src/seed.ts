import bcrypt from 'bcryptjs';
import { connectDb } from './config/db.js';
import { UserModel } from './modules/users/user.model.js';
import { TeamModel } from './modules/teams/team.model.js';
import { ProjectModel } from './modules/projects/project.model.js';
import { generateProjectPlan } from './modules/projects/generator.js';

export async function seedDemoData() {
  const email = 'demo@collab.ai';
  let owner = await UserModel.findOne({ email });
  if (!owner) {
    owner = await UserModel.create({
      name: 'Demo Lead',
      email,
      passwordHash: await bcrypt.hash('Password123!', 12),
      github: {
        username: 'demo-lead',
        email,
        emailVerifiedAt: new Date(),
        connectedAt: new Date()
      },
      skills: [
        { name: 'React', level: 5 },
        { name: 'Project planning', level: 4 },
        { name: 'GitHub', level: 4 }
      ]
    });
  } else if (!owner.github?.username) {
    owner.github = {
      ...owner.github,
      username: 'demo-lead',
      email,
      emailVerifiedAt: new Date(),
      connectedAt: new Date()
    };
    await owner.save();
  }

  const hasTeam = await TeamModel.exists({ owner: owner._id });
  if (hasTeam) return;

  const backend = await UserModel.create({
    name: 'Aarav Backend',
    email: 'backend@collab.ai',
    passwordHash: await bcrypt.hash('Password123!', 12),
    skills: [
      { name: 'Node API', level: 5 },
      { name: 'MongoDB schema', level: 4 },
      { name: 'Docker', level: 3 }
    ]
  });
  const frontend = await UserModel.create({
    name: 'Maya Frontend',
    email: 'frontend@collab.ai',
    passwordHash: await bcrypt.hash('Password123!', 12),
    skills: [
      { name: 'React UI', level: 5 },
      { name: 'CSS', level: 4 },
      { name: 'Testing', level: 3 }
    ]
  });

  const team = await TeamModel.create({
    name: 'Capstone Builders',
    description: 'Demo student team for AI-assisted project setup.',
    owner: owner._id,
    members: [
      { user: owner._id, title: 'Project Lead', skills: owner.skills },
      { user: backend._id, title: 'Backend Engineer', skills: backend.skills },
      { user: frontend._id, title: 'Frontend Engineer', skills: frontend.skills }
    ]
  });

  const plan = generateProjectPlan('web_app', team);
  await ProjectModel.create({
    name: 'AI Team Collab Agent',
    description: 'A generated demo project showing role assignment, workflow planning, and GitHub contribution insights.',
    type: 'web_app',
    status: 'active',
    owner: owner._id,
    team: team._id,
    structure: plan.structure,
    generatedRoles: plan.generatedRoles,
    tasks: plan.tasks,
    github: {
      owner: 'openai',
      repo: 'openai-node',
      branch: 'master',
      connectedAt: new Date(),
      stats: {
        commits: 128,
        pullRequests: 34,
        mergedPullRequests: 28,
        openPullRequests: 6,
        lastSyncedAt: new Date(),
        contributors: [
          { login: 'demo-lead', commits: 54, additions: 0, deletions: 0 },
          { login: 'backend-student', commits: 43, additions: 0, deletions: 0 },
          { login: 'frontend-student', commits: 31, additions: 0, deletions: 0 }
        ]
      }
    }
  });
}

if (process.argv[1]?.endsWith('seed.ts')) {
  await connectDb();
  await seedDemoData();
  process.exit(0);
}
