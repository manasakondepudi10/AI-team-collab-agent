import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  FolderKanban,
  GitBranch,
  Github,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GoalManagement } from './features/projectManagement/GoalManagement';
import {
  api,
  clearToken,
  getToken,
  setToken,
  type ArchitecturePlan,
  type PlannerMessage,
  type Project,
  type Team,
  type TeamResource,
  type User
} from './api';

type View = 'dashboard' | 'create' | 'projects' | 'goals' | 'github';

const starterMembers = [
  { name: 'Aarav Backend', email: 'backend@collab.ai', title: 'Backend Engineer', skills: [{ name: 'Node API', level: 5 }, { name: 'MongoDB', level: 4 }] },
  { name: 'Maya Frontend', email: 'frontend@collab.ai', title: 'Frontend Engineer', skills: [{ name: 'React UI', level: 5 }, { name: 'CSS', level: 4 }] },
  { name: 'Riya QA', email: 'qa@collab.ai', title: 'QA Engineer', skills: [{ name: 'Testing', level: 4 }, { name: 'GitHub', level: 3 }] }
];

export function App() {
  const [tokenReady, setTokenReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [login, setLogin] = useState({ identifier: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [plannerMessages, setPlannerMessages] = useState<PlannerMessage[]>([
    {
      role: 'assistant',
      content: 'Tell me what you want to build, your team size, tech stack, timeline, and any constraints. I will turn it into an architecture plan.'
    }
  ]);
  const [plannerDraft, setPlannerDraft] = useState('');
  const [architecturePlan, setArchitecturePlan] = useState<ArchitecturePlan | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    const authError = params.get('auth_error');

    if (callbackToken) {
      setToken(callbackToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authError) {
      setNotice(authError);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = callbackToken ?? getToken();
    if (!token) {
      setTokenReady(true);
      return;
    }

    api
      .me()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => clearToken())
      .finally(() => setTokenReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshData();
  }, [user]);

  const selectedProject = useMemo(
    () => projects.find((project) => project._id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId]
  );

  async function refreshData() {
    setLoading(true);
    try {
      const [teamResult, projectResult, dashboardResult] = await Promise.all([api.teams(), api.projects(), api.dashboard()]);
      setTeams(teamResult.teams);
      setProjects(projectResult.projects);
      setDashboard(dashboardResult);
      setSelectedProjectId((current) => current ?? projectResult.projects[0]?._id ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice('');
    try {
      const result = await api.login(login.identifier, login.password);
      setToken(result.token);
      setUser(result.user);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not log in');
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubLogin() {
    setLoading(true);
    setNotice('');
    try {
      const { url } = await api.githubAuthUrl();
      window.location.href = url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'GitHub OAuth is not configured yet. Add credentials in .env.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(event: React.FormEvent) {
    event.preventDefault();
    setNotice('');

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setNotice('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.setPassword(passwordForm.password);
      setUser(result.user);
      setPasswordForm({ password: '', confirmPassword: '' });
      setNotice('Password set. You can use direct sign in next time.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not set password');
    } finally {
      setLoading(false);
    }
  }

  async function handlePlannerSubmit(event: React.FormEvent) {
    event.preventDefault();
    const prompt = plannerDraft.trim();
    if (!prompt) return;

    const nextMessages: PlannerMessage[] = [...plannerMessages, { role: 'user', content: prompt }];
    setPlannerMessages(nextMessages);
    setPlannerDraft('');
    setLoading(true);
    setNotice('');

    try {
      const teamResources = starterMembers.map((member) => ({
        name: member.name,
        role: member.title,
        skills: member.skills.map((skill) => skill.name),
        availability: 'Part-time student contributor'
      }));
      const result = await api.generateArchitecturePlan({
        projectBrief: prompt,
        teamSize: teamResources.length,
        teamResources,
        messages: nextMessages
      });
      if (result.mode === 'plan') {
        setArchitecturePlan(result.plan);
      }
      setPlannerMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: result.reply
        }
      ]);
      if (result.warning) setNotice(result.warning);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not generate architecture plan');
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubConnect() {
    try {
      const { url } = await api.githubConnect();
      window.location.href = url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'GitHub OAuth is not configured yet. Add credentials in .env.');
    }
  }

  async function handleSync(projectId: string) {
    setLoading(true);
    try {
      await api.syncGithub(projectId);
      setNotice('GitHub contribution metrics synced.');
      await refreshData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'GitHub sync failed');
    } finally {
      setLoading(false);
    }
  }

  if (!tokenReady) return <FullScreenLoader />;
  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">
            <Sparkles size={22} />
          </div>
          <h1>AI Team Collab Agent</h1>
          <p>Structured project setup, role assignment, GitHub visibility, and progress tracking for student teams.</p>

          <div className="oauth-stack">
            <button className="primary github-auth-button" type="button" onClick={handleGithubLogin} disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <Github size={18} />}
              Continue with GitHub
            </button>
            <button className="ghost" type="button" onClick={() => setShowPasswordLogin((current) => !current)}>
              {showPasswordLogin ? 'Hide password sign in' : 'Use app password'}
            </button>
          </div>

          {showPasswordLogin && (
            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                Email or GitHub username
                <input
                  required
                  autoCapitalize="none"
                  value={login.identifier}
                  onChange={(event) => setLogin({ ...login, identifier: event.target.value })}
                />
              </label>
              <label>
                App password
                <input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
              </label>
              {notice && <div className="notice">{notice}</div>}
              <button className="primary" disabled={loading}>
                {loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
                Sign in
              </button>
            </form>
          )}
          {!showPasswordLogin && notice && <div className="notice">{notice}</div>}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-mark">
            <Sparkles size={20} />
          </div>
          <div>
            <strong>AI Collab</strong>
            <span>Project command center</span>
          </div>
        </div>
        <nav>
          <NavButton active={view === 'dashboard'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setView('dashboard')} />
          <NavButton active={view === 'create'} icon={<Plus size={18} />} label="Create Project" onClick={() => setView('create')} />
          <NavButton active={view === 'projects'} icon={<FolderKanban size={18} />} label="Projects" onClick={() => setView('projects')} />
          <NavButton active={view === 'goals'} icon={<CheckCircle2 size={18} />} label="Goals" onClick={() => setView('goals')} />
          <NavButton active={view === 'github'} icon={<Github size={18} />} label="GitHub" onClick={() => setView('github')} />
        </nav>
        <button
          className="ghost logout"
          onClick={() => {
            clearToken();
            setUser(null);
          }}
        >
          <LogOut size={18} />
          Log out
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p>Welcome back, {user.name}</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="profile-pill">
            <span>{user.github?.username ? `@${user.github.username}` : 'GitHub pending'}</span>
            <div>{user.name.charAt(0)}</div>
          </div>
        </header>

        {notice && <div className="notice wide">{notice}</div>}
        {loading && <div className="inline-loader"><Loader2 className="spin" size={18} /> Updating workspace</div>}

        {view === 'dashboard' && <Dashboard dashboard={dashboard} projects={projects} onOpenProjects={() => setView('projects')} />}
        {view === 'create' && (
          <ProjectPlanner
            messages={plannerMessages}
            draft={plannerDraft}
            plan={architecturePlan}
            loading={loading}
            teamResources={starterMembers.map((member) => ({
              name: member.name,
              role: member.title,
              skills: member.skills.map((skill) => skill.name),
              availability: 'Part-time student contributor'
            }))}
            onDraftChange={setPlannerDraft}
            onSubmit={handlePlannerSubmit}
          />
        )}
        {view === 'projects' && <Projects projects={projects} selected={selectedProject} onSelect={setSelectedProjectId} />}
        {view === 'goals' && <GoalManagement projects={projects} teams={teams} onNotice={setNotice} />}
        {view === 'github' && (
          <GithubPanel
            projects={projects}
            selected={selectedProject}
            passwordForm={passwordForm}
            onPasswordFormChange={setPasswordForm}
            onSetPassword={handleSetPassword}
            onConnect={handleGithubConnect}
            onSync={handleSync}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  dashboard,
  projects,
  onOpenProjects
}: {
  dashboard: Awaited<ReturnType<typeof api.dashboard>> | null;
  projects: Project[];
  onOpenProjects: () => void;
}) {
  const stats = dashboard?.stats ?? { activeProjects: 0, completedTasks: 0, totalTasks: 0, commits: 0, pullRequests: 0 };
  const contributionData = projects.flatMap((project) => project.github?.stats?.contributors ?? []).slice(0, 8);

  return (
    <>
      <section className="metric-grid">
        <Metric icon={<FolderKanban />} label="Active Projects" value={stats.activeProjects} />
        <Metric icon={<CheckCircle2 />} label="Tasks Done" value={`${stats.completedTasks}/${stats.totalTasks}`} />
        <Metric icon={<GitBranch />} label="Commits" value={stats.commits} />
        <Metric icon={<Activity />} label="Pull Requests" value={stats.pullRequests} />
      </section>

      <section className="content-grid">
        <div className="panel span-2">
          <div className="panel-heading">
            <div>
              <h2>Current Projects</h2>
              <p>Generated workflows and team ownership at a glance.</p>
            </div>
            <button className="ghost" onClick={onOpenProjects}>
              View all <ChevronRight size={16} />
            </button>
          </div>
          <div className="project-list">
            {projects.slice(0, 4).map((project) => (
              <ProjectRow key={project._id} project={project} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Contributions</h2>
              <p>Commit distribution from GitHub sync.</p>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={contributionData}>
                <XAxis dataKey="login" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="commits" fill="#246bfe" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </>
  );
}

function ProjectPlanner({
  messages,
  draft,
  plan,
  loading,
  teamResources,
  onDraftChange,
  onSubmit
}: {
  messages: PlannerMessage[];
  draft: string;
  plan: ArchitecturePlan | null;
  loading: boolean;
  teamResources: TeamResource[];
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <section className="planner-layout">
      <div className="panel planner-chat">
        <div className="panel-heading">
          <div>
            <h2>Architecture Chat</h2>
            <p>Describe the product, users, deadline, team size, skills, and deployment constraints.</p>
          </div>
        </div>
        <div className="chat-thread">
          {messages.map((message, index) => (
            <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
              {message.content}
            </div>
          ))}
        </div>
        <form className="chat-composer" onSubmit={onSubmit}>
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Example: We are building a campus event app with 4 students: React, Node, MongoDB, UI design. Need MVP in 3 weeks."
          />
          <button className="primary" disabled={loading || !draft.trim()}>
            {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Generate Architecture
          </button>
        </form>
      </div>

      <div className="planner-side">
        <aside className="panel">
          <h2>Team Resources</h2>
          <div className="member-stack">
            {teamResources.map((member) => (
              <div className="member-card" key={member.name}>
                <strong>{member.name}</strong>
                <span>{member.role}</span>
                <div className="tags">
                  {member.skills.map((skill) => (
                    <small key={skill}>{skill}</small>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {plan && <ArchitecturePreview plan={plan} />}
      </div>
    </section>
  );
}

function ArchitecturePreview({ plan }: { plan: ArchitecturePlan }) {
  return (
    <aside className="panel plan-preview">
      <div className="panel-heading">
        <div>
          <h2>{plan.projectName}</h2>
          <p>{plan.summary}</p>
        </div>
        <span className="status active">{formatArchitectureStyle(plan.architectureStyle)}</span>
      </div>
      <DetailBlock title="Recommended Stack" items={plan.recommendedStack} icon={<Boxes />} />
      <div className="plan-section">
        <h3>Why This Architecture</h3>
        <p>{plan.architectureReason}</p>
      </div>
      <div className="plan-section">
        <h3>Modules</h3>
        <div className="module-list">
          {plan.modules.map((module) => (
            <div className="module-row" key={module.name}>
              <strong>{module.name}</strong>
              <span>{module.responsibility}</span>
              {module.ownerRole && <small>{module.ownerRole}</small>}
            </div>
          ))}
        </div>
      </div>
      <DetailBlock title="Data Model" items={plan.dataModel} icon={<Boxes />} />
      <DetailBlock title="API Plan" items={plan.apiPlan} icon={<GitBranch />} />
      <DetailBlock title="Milestones" items={plan.milestones} icon={<CheckCircle2 />} />
      <DetailBlock title="Risks" items={plan.risks} icon={<ShieldCheck />} />
    </aside>
  );
}

function Projects({ projects, selected, onSelect }: { projects: Project[]; selected?: Project; onSelect: (id: string) => void }) {
  return (
    <section className="content-grid">
      <div className="panel">
        <h2>Project Portfolio</h2>
        <div className="project-list compact">
          {projects.map((project) => (
            <button key={project._id} className={`project-select ${selected?._id === project._id ? 'active' : ''}`} onClick={() => onSelect(project._id)}>
              <span>{project.name}</span>
              <small>{project.status}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="panel span-2">
        {selected ? (
          <>
            <div className="panel-heading">
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
              <StatusBadge status={selected.status} />
            </div>
            <div className="detail-grid">
              <DetailBlock title="Generated Stack" items={selected.structure?.stack ?? []} icon={<Boxes />} />
              <DetailBlock title="Folder Structure" items={selected.structure?.folders ?? []} icon={<FolderKanban />} />
              <DetailBlock title="Workflow" items={selected.structure?.workflow ?? []} icon={<BarChart3 />} />
            </div>
            <h3>Assigned Roles</h3>
            <div className="role-grid">
              {selected.generatedRoles.map((role) => (
                <div className="role-card" key={role.role}>
                  <strong>{role.role}</strong>
                  <span>{role.user?.name ?? 'Unassigned'}</span>
                  <meter value={role.confidence} max={1} />
                  <p>{role.reason}</p>
                </div>
              ))}
            </div>
            <h3>Initial Tasks</h3>
            <div className="task-list">
              {selected.tasks.map((task) => (
                <div className="task-row" key={task._id}>
                  <CheckCircle2 size={16} />
                  <span>{task.title}</span>
                  <small>{task.status.replace('_', ' ')}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </section>
  );
}

function GithubPanel({
  projects,
  selected,
  passwordForm,
  onPasswordFormChange,
  onSetPassword,
  onConnect,
  onSync,
  loading
}: {
  projects: Project[];
  selected?: Project;
  passwordForm: { password: string; confirmPassword: string };
  onPasswordFormChange: (value: { password: string; confirmPassword: string }) => void;
  onSetPassword: (event: React.FormEvent) => void;
  onConnect: () => void;
  onSync: (projectId: string) => void;
  loading: boolean;
}) {
  return (
    <section className="content-grid">
      <div className="panel span-2">
        <div className="panel-heading">
          <div>
            <h2>GitHub Control Room</h2>
            <p>Connect OAuth, sync repository metrics, and receive signed webhook activity.</p>
          </div>
          <button className="secondary" onClick={onConnect}>
            <Github size={18} />
            Connect GitHub
          </button>
        </div>
        <div className="project-list">
          {projects.map((project) => (
            <div className="github-row" key={project._id}>
              <div>
                <strong>{project.name}</strong>
                <span>
                  {project.github?.owner}/{project.github?.repo}
                </span>
              </div>
              <div className="github-stats">
                <small>{project.github?.stats?.commits ?? 0} commits</small>
                <small>{project.github?.stats?.pullRequests ?? 0} PRs</small>
                <button className="ghost" onClick={() => onSync(project._id)}>
                  Sync
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <aside className="panel">
        <h2>Set Password</h2>
        <form className="auth-form compact-form" onSubmit={onSetPassword}>
          <label>
            New password
            <input
              required
              type="password"
              minLength={8}
              value={passwordForm.password}
              onChange={(event) => onPasswordFormChange({ ...passwordForm, password: event.target.value })}
            />
          </label>
          <label>
            Confirm password
            <input
              required
              type="password"
              minLength={8}
              value={passwordForm.confirmPassword}
              onChange={(event) => onPasswordFormChange({ ...passwordForm, confirmPassword: event.target.value })}
            />
          </label>
          <button className="secondary" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Set Password
          </button>
        </form>
      </aside>
      <aside className="panel">
        <h2>Recent Repository Events</h2>
        <div className="event-stack">
          {(selected?.github?.events ?? []).slice(-6).map((event, index) => (
            <div className="event-item" key={`${event.createdAt}-${index}`}>
              <strong>{event.event}</strong>
              <span>{event.actor} {event.action ?? 'updated repository'}</span>
            </div>
          ))}
          {!(selected?.github?.events?.length) && <p className="muted">Webhook activity will appear here after GitHub sends events.</p>}
        </div>
      </aside>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const done = project.tasks?.filter((task) => task.status === 'done').length ?? 0;
  const total = project.tasks?.length || 1;
  const progress = Math.round((done / total) * 100);

  return (
    <div className="project-row">
      <div>
        <strong>{project.name}</strong>
        <span>{project.structure?.stack?.slice(0, 4).join(' / ')}</span>
      </div>
      <StatusBadge status={project.status} />
      <div className="progress-track">
        <div style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function DetailBlock({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="detail-block">
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Project['status'] }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <FolderKanban size={36} />
      <strong>No project selected</strong>
      <span>Create a project to generate structure, roles, and workflows.</span>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <main className="auth-shell">
      <Loader2 className="spin" />
    </main>
  );
}

function viewTitle(view: View) {
  return {
    dashboard: 'Team Project Dashboard',
    create: 'Create Structured Project',
    projects: 'Projects and Role Assignments',
    goals: 'Team Goals and Progress',
    github: 'GitHub Connections'
  }[view];
}

function formatArchitectureStyle(style: ArchitecturePlan['architectureStyle']) {
  return style
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
