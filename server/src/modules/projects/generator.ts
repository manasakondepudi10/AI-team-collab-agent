import type { Team } from '../teams/team.model.js';

const projectBlueprints = {
  web_app: {
    stack: ['React', 'Node.js', 'Express', 'MongoDB', 'Docker', 'GitHub Actions'],
    folders: ['client/src', 'server/src/modules', 'server/src/config', 'infra', 'docs'],
    workflow: ['Define backlog', 'Design API contract', 'Implement frontend/backend slices', 'Open pull requests', 'Review and merge', 'Deploy release candidate'],
    milestones: ['Requirements freeze', 'MVP scaffold', 'Auth and core CRUD', 'GitHub insights', 'Demo release']
  },
  mobile_app: {
    stack: ['React Native', 'Node.js', 'MongoDB', 'Expo', 'Docker'],
    folders: ['mobile/src/screens', 'mobile/src/components', 'api/src/modules', 'docs'],
    workflow: ['Prototype user journeys', 'Build shared API', 'Implement screens', 'Device testing', 'Release build'],
    milestones: ['UX wireframes', 'API ready', 'Feature complete', 'QA pass']
  },
  api_service: {
    stack: ['Node.js', 'Express', 'MongoDB', 'OpenAPI', 'Docker'],
    folders: ['src/modules', 'src/config', 'src/jobs', 'tests', 'docs'],
    workflow: ['Model domain', 'Write API contract', 'Implement services', 'Add integration tests', 'Publish docs'],
    milestones: ['Schema approved', 'Endpoints live', 'Load test', 'Production handoff']
  },
  data_science: {
    stack: ['Python', 'FastAPI', 'MongoDB', 'Jupyter', 'Docker'],
    folders: ['notebooks', 'api', 'pipelines', 'models', 'reports'],
    workflow: ['Collect dataset', 'Clean features', 'Train baseline', 'Evaluate model', 'Expose inference API'],
    milestones: ['Dataset ready', 'Baseline metrics', 'Model review', 'Demo notebook']
  },
  iot: {
    stack: ['MQTT', 'Node.js', 'MongoDB', 'React', 'Docker'],
    folders: ['firmware', 'gateway', 'server/src/modules', 'client/src', 'docs'],
    workflow: ['Device protocol', 'Gateway ingestion', 'Dashboard visualization', 'Field test', 'Hardening'],
    milestones: ['Telemetry flowing', 'Dashboard live', 'Alerting ready', 'Final demo']
  },
  research: {
    stack: ['React', 'Node.js', 'MongoDB', 'Markdown Docs', 'Docker'],
    folders: ['docs/literature', 'docs/experiments', 'client/src', 'server/src'],
    workflow: ['Research questions', 'Literature map', 'Experiment plan', 'Weekly synthesis', 'Final presentation'],
    milestones: ['Proposal', 'Annotated bibliography', 'Experiment results', 'Report draft']
  }
};

const roleSkillMap: Record<string, string[]> = {
  'Project Lead': ['management', 'planning', 'communication'],
  Frontend: ['react', 'frontend', 'ui', 'css', 'javascript', 'typescript'],
  Backend: ['node', 'express', 'api', 'backend', 'javascript', 'typescript'],
  Database: ['mongodb', 'database', 'schema', 'sql'],
  DevOps: ['docker', 'github', 'ci', 'deployment'],
  QA: ['testing', 'qa', 'automation']
};

function scoreMember(member: Team['members'][number], keywords: string[]) {
  return (member.skills ?? []).reduce((score, skill) => {
    const name = skill.name?.toLowerCase() ?? '';
    return score + (keywords.some((keyword) => name.includes(keyword)) ? skill.level ?? 1 : 0);
  }, 0);
}

export function generateProjectPlan(type: keyof typeof projectBlueprints, team: Team) {
  const blueprint = projectBlueprints[type] ?? projectBlueprints.web_app;
  const assigned = new Set<string>();

  const generatedRoles = Object.entries(roleSkillMap).map(([role, keywords]) => {
    const candidates = team.members
      .map((member) => ({ member, score: scoreMember(member, keywords) }))
      .filter((candidate) => !assigned.has(String(candidate.member.user)))
      .sort((a, b) => b.score - a.score);

    const winner = candidates[0] ?? team.members[0];
    if (winner?.member?.user) assigned.add(String(winner.member.user));

    return {
      role,
      user: winner?.member?.user,
      confidence: Math.min(0.95, Math.max(0.45, ((winner?.score ?? 1) + 2) / 10)),
      reason: winner?.score ? `Matched ${role.toLowerCase()} skills from the team profile.` : `Assigned to keep ownership clear while the team refines skills.`
    };
  });

  const tasks = blueprint.milestones.map((milestone, index) => ({
    title: milestone,
    description: `${milestone} milestone for the generated ${type.replace('_', ' ')} workflow.`,
    priority: index < 2 ? 'high' : 'medium',
    status: index === 0 ? 'in_progress' : 'todo',
    assignee: generatedRoles[index % generatedRoles.length]?.user
  }));

  return {
    structure: blueprint,
    generatedRoles,
    tasks
  };
}
