const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';
const TOKEN_KEY = 'collab_token';

export type User = {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'student' | 'mentor' | 'admin';
  skills: { name: string; level: number }[];
  github?: { username?: string; email?: string; emailVerifiedAt?: string; connectedAt?: string };
};

export type Team = {
  _id: string;
  name: string;
  description?: string;
  members: {
    user: User;
    title: string;
    skills: { name: string; level: number }[];
    allocation: number;
  }[];
};

export type Project = {
  _id: string;
  name: string;
  description: string;
  type: string;
  status: 'planning' | 'active' | 'review' | 'completed';
  team: Team;
  structure: {
    stack: string[];
    folders: string[];
    workflow: string[];
    milestones: string[];
  };
  generatedRoles: {
    role: string;
    user?: User;
    confidence: number;
    reason: string;
  }[];
  tasks: {
    _id: string;
    title: string;
    description?: string;
    status: 'todo' | 'in_progress' | 'review' | 'done';
    priority: 'low' | 'medium' | 'high';
    assignee?: User;
  }[];
  github?: {
    owner?: string;
    repo?: string;
    branch?: string;
    stats?: {
      commits: number;
      pullRequests: number;
      mergedPullRequests: number;
      openPullRequests: number;
      lastSyncedAt?: string;
      contributors: { login: string; commits: number; avatarUrl?: string }[];
    };
    events?: { event: string; actor: string; action?: string; createdAt: string }[];
  };
};

export type GithubStats = NonNullable<NonNullable<Project['github']>['stats']>;

export type GoalStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';
export type GoalNodeType = 'folder' | 'task' | 'module';

export type GoalNode = {
  _id: string;
  project: string;
  title: string;
  type: GoalNodeType;
  parentId?: string | null;
  assignedMembers: User[];
  githubPath: string;
  completionStatus: GoalStatus;
  progressPercentage: number;
  manualProgressOverride: boolean;
  description: string;
  priority: GoalPriority;
  deadline?: string;
  requiredFiles: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  children?: GoalNode[];
};

export type Assignment = {
  _id: string;
  project: string;
  goal: GoalNode;
  assignedTo: User;
  assignedBy: User;
  status: GoalStatus;
  priority: GoalPriority;
  description: string;
  deadline?: string;
  completedAt?: string;
  createdAt: string;
};

export type GithubIntegration = {
  _id: string;
  project: string;
  owner: string;
  repo: string;
  branch: string;
  githubRepoId?: string;
  isPrivate: boolean;
  collaborators: {
    githubId?: string;
    username?: string;
    email?: string;
    role?: string;
    invitationStatus: 'pending' | 'accepted' | 'failed' | 'synced' | 'unknown';
    invitedAt?: string;
    lastSyncedAt?: string;
  }[];
  lastSyncedAt?: string;
  syncStatus: 'idle' | 'syncing' | 'failed';
  syncError?: string;
};

export type ActivityLog = {
  _id: string;
  action: string;
  entityType: string;
  metadata?: Record<string, unknown>;
  actor?: User;
  createdAt: string;
};

export type NotificationItem = {
  _id: string;
  type: 'assignment' | 'github_sync' | 'deadline' | 'completion' | 'system';
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
};

export type ManagementOverview = {
  totalGoals: number;
  averageProgress: number;
  statusCounts: Record<string, number>;
  memberProgress: { member: User; total: number; done: number; progress: number }[];
  health: 'on_track' | 'blocked' | 'watch' | 'needs_attention';
};

export type PlannerMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type TeamResource = {
  name: string;
  role?: string;
  skills: string[];
  availability?: string;
};

export type ArchitecturePlan = {
  projectName: string;
  summary: string;
  architectureStyle: 'monolith' | 'modular_monolith' | 'microservices' | 'serverless' | 'hybrid';
  architectureReason: string;
  recommendedStack: string[];
  modules: { name: string; responsibility: string; ownerRole?: string }[];
  dataModel: string[];
  apiPlan: string[];
  milestones: string[];
  risks: string[];
  nextQuestions: string[];
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export const api = {
  githubAuthUrl: () => request<{ url: string }>('/auth/github'),
  login: (identifier: string, password: string) =>
    request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    }),
  setPassword: (password: string) =>
    request<{ user: User }>('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ password })
    }),
  me: () => request<{ user: User }>('/auth/me'),
  teams: () => request<{ teams: Team[] }>('/teams'),
  createTeam: (body: unknown) =>
    request<{ team: Team }>('/teams', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  projects: () => request<{ projects: Project[] }>('/projects'),
  dashboard: () =>
    request<{
      stats: { activeProjects: number; completedTasks: number; totalTasks: number; commits: number; pullRequests: number };
      recentProjects: Project[];
    }>('/projects/dashboard'),
  generateArchitecturePlan: (body: {
    projectBrief: string;
    teamSize?: number;
    teamResources: TeamResource[];
    messages: PlannerMessage[];
  }) =>
    request<
      | { mode: 'question'; reply: string; missingDetails?: string[]; source: 'conversation' | 'llm'; warning?: string }
      | { mode: 'plan'; reply: string; plan: ArchitecturePlan; source: 'llm' | 'fallback'; warning?: string }
    >('/projects/plan/chat', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  createProject: (body: unknown) =>
    request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  syncGithub: (projectId: string) =>
    request<{ stats: GithubStats }>(`/github/projects/${projectId}/sync`, {
      method: 'POST'
    }),
  githubConnect: () => request<{ url: string }>('/github/connect')
  ,
  goals: (projectId: string) => request<{ goals: GoalNode[]; tree: GoalNode[] }>(`/project-management/projects/${projectId}/goals`),
  createGoal: (projectId: string, body: Partial<GoalNode> & { title: string; type: GoalNodeType }) =>
    request<{ goal: GoalNode }>(`/project-management/projects/${projectId}/goals`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  updateGoal: (goalId: string, body: Partial<GoalNode>) =>
    request<{ goal: GoalNode }>(`/project-management/goals/${goalId}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    }),
  deleteGoal: (goalId: string) =>
    request<{ deleted: number }>(`/project-management/goals/${goalId}`, {
      method: 'DELETE'
    }),
  assignGoal: (
    goalId: string,
    body: { assignedMemberIds: string[]; description?: string; priority?: GoalPriority; status?: GoalStatus; deadline?: string }
  ) =>
    request<{ goal: GoalNode; assignments: Assignment[] }>(`/project-management/goals/${goalId}/assign`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  managementOverview: (projectId: string) =>
    request<{
      overview: ManagementOverview;
      goals: GoalNode[];
      assignments: Assignment[];
      activities: ActivityLog[];
      integration?: GithubIntegration | null;
    }>(`/project-management/projects/${projectId}/overview`),
  assignments: (projectId: string) =>
    request<{ assignments: Assignment[] }>(`/project-management/projects/${projectId}/assignments`),
  listGithubRepositories: () =>
    request<{ repositories: { id: string; owner: string; repo: string; fullName: string; private: boolean; defaultBranch: string }[] }>(
      '/project-management/github/repositories'
    ),
  githubRepository: (projectId: string) =>
    request<{ integration?: GithubIntegration | null }>(`/project-management/projects/${projectId}/github/repository`),
  connectRepository: (projectId: string, body: { owner: string; repo: string; branch?: string }) =>
    request<{ integration: GithubIntegration }>(`/project-management/projects/${projectId}/github/repository`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  syncCollaborators: (projectId: string) =>
    request<{ integration: GithubIntegration }>(`/project-management/projects/${projectId}/github/collaborators/sync`, {
      method: 'POST'
    }),
  inviteCollaborator: (projectId: string, body: { usernameOrEmail: string; permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin' }) =>
    request<{ integration: GithubIntegration }>(`/project-management/projects/${projectId}/github/invite`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  syncGoalProgress: (projectId: string) =>
    request<{ updatedGoals: number; lastSyncedAt: string }>(`/project-management/projects/${projectId}/progress/sync`, {
      method: 'POST'
    }),
  notifications: () => request<{ notifications: NotificationItem[] }>('/project-management/notifications'),
  markNotificationRead: (notificationId: string) =>
    request<{ notification: NotificationItem }>(`/project-management/notifications/${notificationId}/read`, {
      method: 'PATCH'
    })
};
