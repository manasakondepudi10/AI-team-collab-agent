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
};
