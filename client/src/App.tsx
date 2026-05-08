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
import { api, clearToken, getToken, setToken, type Project, type Team, type User } from './api';

type View = 'dashboard' | 'create' | 'projects' | 'github';

const projectTypes = [
  { value: 'web_app', label: 'Web App' },
  { value: 'mobile_app', label: 'Mobile App' },
  { value: 'api_service', label: 'API Service' },
  { value: 'data_science', label: 'Data Science' },
  { value: 'iot', label: 'IoT' },
  { value: 'research', label: 'Research' }
];

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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState({ identifier: 'demo@collab.ai', password: 'Password123!' });
  const [registration, setRegistration] = useState({ name: '', email: '', githubUsername: '', password: '' });
  const [registrationState, setRegistrationState] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

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

  async function handleGithubRegistration(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice('');

    try {
      const result = await api.startGithubRegistration(registration);
      setRegistrationState(result.state);
      setVerificationCode('');
      setNotice(
        result.emailDelivery.mode === 'smtp'
          ? `Verification code sent to ${registration.email}.`
          : 'Email service is not configured. Development OTP is printed in the API container logs.'
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start GitHub registration');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyRegistrationEmail(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice('');

    try {
      const result = await api.verifyRegistrationEmail({ state: registrationState, code: verificationCode });
      window.location.href = result.url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not verify email');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice('');
    const form = new FormData(event.currentTarget);

    try {
      let teamId = String(form.get('teamId') ?? '');
      if (teamId === 'new') {
        const result = await api.createTeam({
          name: String(form.get('teamName') || 'New Student Team'),
          description: 'Auto-created from the project setup flow.',
          members: starterMembers
        });
        teamId = result.team._id;
      }

      const result = await api.createProject({
        name: String(form.get('name')),
        description: String(form.get('description')),
        type: String(form.get('type')),
        teamId,
        github: {
          owner: String(form.get('githubOwner') || 'openai'),
          repo: String(form.get('githubRepo') || 'openai-node'),
          branch: String(form.get('branch') || 'main')
        }
      });

      setNotice(`Generated ${result.project.name} with roles, workflow, tasks, and repository tracking.`);
      setView('projects');
      await refreshData();
      setSelectedProjectId(result.project._id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Project creation failed');
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
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
              Sign in
            </button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
              Register
            </button>
          </div>

          {authMode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                Email or GitHub username
                <input
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
          ) : (
            <>
              {!registrationState ? (
                <form className="auth-form" onSubmit={handleGithubRegistration}>
                  <label>
                    Full name
                    <input required value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} />
                  </label>
                  <label>
                    Verified GitHub email
                    <input
                      required
                      type="email"
                      autoCapitalize="none"
                      value={registration.email}
                      onChange={(event) => setRegistration({ ...registration, email: event.target.value })}
                    />
                  </label>
                  <label>
                    GitHub username
                    <input
                      required
                      autoCapitalize="none"
                      placeholder="octocat"
                      value={registration.githubUsername}
                      onChange={(event) => setRegistration({ ...registration, githubUsername: event.target.value })}
                    />
                  </label>
                  <label>
                    App password
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={registration.password}
                      onChange={(event) => setRegistration({ ...registration, password: event.target.value })}
                    />
                  </label>
                  <p className="auth-hint">First verify your email with an OTP, then GitHub will confirm the username and verified email.</p>
                  {notice && <div className="notice">{notice}</div>}
                  <button className="primary" disabled={loading}>
                    {loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
                    Send Verification Code
                  </button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleVerifyRegistrationEmail}>
                  <label>
                    Email verification code
                    <input
                      required
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </label>
                  <p className="auth-hint">Enter the 6-digit code sent to {registration.email}. After this, GitHub authorization will open.</p>
                  {notice && <div className="notice">{notice}</div>}
                  <div className="auth-actions">
                    <button className="secondary" type="button" onClick={() => setRegistrationState('')}>
                      Edit Details
                    </button>
                    <button className="primary" disabled={loading}>
                      {loading ? <Loader2 className="spin" size={18} /> : <Github size={18} />}
                      Verify and Continue
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
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
        {view === 'create' && <CreateProject teams={teams} onSubmit={handleCreateProject} />}
        {view === 'projects' && <Projects projects={projects} selected={selectedProject} onSelect={setSelectedProjectId} />}
        {view === 'github' && <GithubPanel projects={projects} selected={selectedProject} onConnect={handleGithubConnect} onSync={handleSync} />}
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

function CreateProject({ teams, onSubmit }: { teams: Team[]; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="creation-layout" onSubmit={onSubmit}>
      <section className="panel span-2 form-panel">
        <div className="panel-heading">
          <div>
            <h2>Project Generator</h2>
            <p>Select a type and the agent creates stack, folders, milestones, tasks, and role ownership.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Project name
            <input name="name" defaultValue="AI Team Collab Agent" required />
          </label>
          <label>
            Project type
            <select name="type" defaultValue="web_app">
              {projectTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Description
            <textarea
              name="description"
              required
              defaultValue="A web-based system that automates student team role assignment, project setup, GitHub contribution tracking, and progress dashboards."
            />
          </label>
          <label>
            Team
            <select name="teamId" defaultValue={teams[0]?._id ?? 'new'}>
              {teams.map((team) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
              <option value="new">Create demo team</option>
            </select>
          </label>
          <label>
            New team name
            <input name="teamName" defaultValue="Capstone Builders" />
          </label>
          <label>
            GitHub owner
            <input name="githubOwner" defaultValue="openai" />
          </label>
          <label>
            GitHub repo
            <input name="githubRepo" defaultValue="openai-node" />
          </label>
          <label>
            Branch
            <input name="branch" defaultValue="master" />
          </label>
        </div>
        <button className="primary">
          <Sparkles size={18} />
          Generate Project
        </button>
      </section>

      <aside className="panel">
        <h2>Starter Team Skills</h2>
        <div className="member-stack">
          {starterMembers.map((member) => (
            <div className="member-card" key={member.email}>
              <strong>{member.name}</strong>
              <span>{member.title}</span>
              <div className="tags">
                {member.skills.map((skill) => (
                  <small key={skill.name}>{skill.name}</small>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </form>
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
  onConnect,
  onSync
}: {
  projects: Project[];
  selected?: Project;
  onConnect: () => void;
  onSync: (projectId: string) => void;
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
    github: 'GitHub Connections'
  }[view];
}
