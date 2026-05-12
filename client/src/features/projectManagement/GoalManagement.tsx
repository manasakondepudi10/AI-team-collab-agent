import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  GitBranch,
  Github,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users
} from 'lucide-react';
import {
  api,
  type ActivityLog,
  type Assignment,
  type GithubIntegration,
  type GoalNode,
  type GoalNodeType,
  type GoalPriority,
  type GoalStatus,
  type ManagementOverview,
  type NotificationItem,
  type Project,
  type Team
} from '../../api';

type GoalForm = {
  title: string;
  type: GoalNodeType;
  githubPath: string;
  parentId: string;
};

type GoalManagementProps = {
  projects: Project[];
  teams: Team[];
  onNotice: (message: string) => void;
};

const statuses: GoalStatus[] = ['pending', 'in_progress', 'completed', 'blocked'];
const priorities: GoalPriority[] = ['low', 'medium', 'high', 'critical'];
const nodeTypes: GoalNodeType[] = ['module', 'folder', 'task'];

export function GoalManagement({ projects, teams, onNotice }: GoalManagementProps) {
  const [projectId, setProjectId] = useState(projects[0]?._id ?? '');
  const [goals, setGoals] = useState<GoalNode[]>([]);
  const [tree, setTree] = useState<GoalNode[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [overview, setOverview] = useState<ManagementOverview | null>(null);
  const [integration, setIntegration] = useState<GithubIntegration | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [loading, setLoading] = useState(false);
  const [draggedGoalId, setDraggedGoalId] = useState('');
  const [goalForm, setGoalForm] = useState<GoalForm>({ title: '', type: 'task', githubPath: '', parentId: '' });
  const [repoForm, setRepoForm] = useState({ owner: '', repo: '', branch: 'main' });
  const [inviteForm, setInviteForm] = useState({ usernameOrEmail: '', permission: 'push' as const });

  const selectedProject = projects.find((project) => project._id === projectId);
  const selectedGoal = goals.find((goal) => goal._id === selectedGoalId) ?? goals[0];
  const selectedTeam = teams.find((team) => team._id === selectedProject?.team?._id);
  const teamMembers = selectedTeam?.members ?? [];

  useEffect(() => {
    if (projects.length && !projectId) setProjectId(projects[0]._id);
  }, [projects, projectId]);

  useEffect(() => {
    if (!projectId) return;
    void refreshWorkspace(projectId);
  }, [projectId]);

  useEffect(() => {
    if (integration) {
      setRepoForm({ owner: integration.owner, repo: integration.repo, branch: integration.branch });
    }
  }, [integration]);

  const goalOptions = useMemo(() => goals.map((goal) => ({ id: goal._id, label: goal.title })), [goals]);

  async function refreshWorkspace(nextProjectId = projectId) {
    if (!nextProjectId) return;
    setLoading(true);
    try {
      const [goalResult, overviewResult, notificationResult] = await Promise.all([
        api.goals(nextProjectId),
        api.managementOverview(nextProjectId),
        api.notifications()
      ]);
      setGoals(goalResult.goals);
      setTree(goalResult.tree);
      setOverview(overviewResult.overview);
      setAssignments(overviewResult.assignments);
      setIntegration(overviewResult.integration ?? null);
      setActivities(overviewResult.activities);
      setNotifications(notificationResult.notifications);
      setSelectedGoalId((current) => current || goalResult.goals[0]?._id || '');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not load project management workspace');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGoal(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !goalForm.title.trim()) return;
    setLoading(true);
    try {
      const result = await api.createGoal(projectId, {
        title: goalForm.title.trim(),
        type: goalForm.type,
        githubPath: goalForm.githubPath.trim(),
        parentId: goalForm.parentId || null
      });
      setSelectedGoalId(result.goal._id);
      setGoalForm({ title: '', type: 'task', githubPath: '', parentId: '' });
      await refreshWorkspace();
      onNotice('Goal node created.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not create goal');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSelectedGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGoal) return;

    const form = new FormData(event.currentTarget);
    const assignedMemberIds = form.getAll('assignedMembers').map(String);
    const requiredFiles = String(form.get('requiredFiles') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const progressPercentage = Number(form.get('progressPercentage') ?? selectedGoal.progressPercentage);
    const manualProgressOverride = form.get('manualProgressOverride') === 'on';
    const deadlineValue = String(form.get('deadline') ?? '');

    setLoading(true);
    try {
      await api.updateGoal(selectedGoal._id, {
        title: String(form.get('title') ?? selectedGoal.title),
        type: String(form.get('type') ?? selectedGoal.type) as GoalNodeType,
        githubPath: String(form.get('githubPath') ?? ''),
        completionStatus: String(form.get('completionStatus') ?? selectedGoal.completionStatus) as GoalStatus,
        progressPercentage,
        manualProgressOverride,
        description: String(form.get('description') ?? ''),
        priority: String(form.get('priority') ?? selectedGoal.priority) as GoalPriority,
        deadline: deadlineValue ? new Date(deadlineValue).toISOString() : undefined,
        requiredFiles
      });

      if (assignedMemberIds.length) {
        await api.assignGoal(selectedGoal._id, {
          assignedMemberIds,
          description: String(form.get('description') ?? ''),
          priority: String(form.get('priority') ?? selectedGoal.priority) as GoalPriority,
          status: String(form.get('completionStatus') ?? selectedGoal.completionStatus) as GoalStatus,
          deadline: deadlineValue ? new Date(deadlineValue).toISOString() : undefined
        });
      }

      await refreshWorkspace();
      onNotice('Goal updated.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not update goal');
    } finally {
      setLoading(false);
    }
  }

  async function handleDropOnGoal(targetGoalId: string | null) {
    if (!draggedGoalId || draggedGoalId === targetGoalId) return;
    setLoading(true);
    try {
      await api.updateGoal(draggedGoalId, { parentId: targetGoalId });
      await refreshWorkspace();
      onNotice(targetGoalId ? 'Goal moved under selected parent.' : 'Goal moved to root.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not move goal');
    } finally {
      setDraggedGoalId('');
      setLoading(false);
    }
  }

  async function handleDeleteGoal(goalId: string) {
    setLoading(true);
    try {
      await api.deleteGoal(goalId);
      setSelectedGoalId('');
      await refreshWorkspace();
      onNotice('Goal and child nodes deleted.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not delete goal');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectRepo(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await api.connectRepository(projectId, repoForm);
      setIntegration(result.integration);
      await refreshWorkspace();
      onNotice('Repository connected.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not connect repository');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncProgress() {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await api.syncGoalProgress(projectId);
      await refreshWorkspace();
      onNotice(`Progress synced from GitHub for ${result.updatedGoals} goals.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not sync progress');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncCollaborators() {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await api.syncCollaborators(projectId);
      setIntegration(result.integration);
      onNotice('Collaborators synced.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not sync collaborators');
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteCollaborator(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !inviteForm.usernameOrEmail.trim()) return;
    setLoading(true);
    try {
      const result = await api.inviteCollaborator(projectId, inviteForm);
      setIntegration(result.integration);
      setInviteForm({ usernameOrEmail: '', permission: 'push' });
      onNotice('GitHub invitation sent.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not invite collaborator');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="management-layout">
      <div className="management-toolbar panel">
        <label>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" type="button" onClick={() => refreshWorkspace()} disabled={loading || !projectId}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          Refresh
        </button>
        <button className="primary" type="button" onClick={handleSyncProgress} disabled={loading || !integration}>
          <GitBranch size={18} />
          Sync GitHub Progress
        </button>
      </div>

      <div className="metric-grid">
        <ManagementMetric label="Goal Progress" value={`${overview?.averageProgress ?? 0}%`} />
        <ManagementMetric label="Total Goals" value={overview?.totalGoals ?? 0} />
        <ManagementMetric label="Blocked" value={overview?.statusCounts?.blocked ?? 0} />
        <ManagementMetric label="Health" value={formatHealth(overview?.health)} />
      </div>

      <div className="management-grid">
        <div className="panel goal-builder">
          <div className="panel-heading">
            <div>
              <h2>Goal Structure</h2>
              <p>Build unlimited nested modules, folders, and tasks.</p>
            </div>
          </div>
          <form className="goal-create-form" onSubmit={handleCreateGoal}>
            <input
              placeholder="Goal title"
              value={goalForm.title}
              onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })}
            />
            <select value={goalForm.type} onChange={(event) => setGoalForm({ ...goalForm, type: event.target.value as GoalNodeType })}>
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
            <select value={goalForm.parentId} onChange={(event) => setGoalForm({ ...goalForm, parentId: event.target.value })}>
              <option value="">Root</option>
              {goalOptions.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.label}
                </option>
              ))}
            </select>
            <input
              placeholder="GitHub path, e.g. backend/auth"
              value={goalForm.githubPath}
              onChange={(event) => setGoalForm({ ...goalForm, githubPath: event.target.value })}
            />
            <button className="primary" disabled={loading || !goalForm.title.trim()}>
              <Plus size={18} />
              Add
            </button>
          </form>
          <div className="goal-tree-root" onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropOnGoal(null)}>
            {tree.length ? (
              tree.map((goal) => (
                <GoalTreeItem
                  key={goal._id}
                  goal={goal}
                  selectedGoalId={selectedGoal?._id}
                  onSelect={setSelectedGoalId}
                  onDragStart={setDraggedGoalId}
                  onDrop={handleDropOnGoal}
                  onDelete={handleDeleteGoal}
                />
              ))
            ) : (
              <div className="empty-state compact-empty">
                <FolderKanban size={30} />
                <span>Create the first module to start planning.</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel goal-detail">
          {selectedGoal ? (
            <GoalDetailForm goal={selectedGoal} teamMembers={teamMembers} onSubmit={handleUpdateSelectedGoal} loading={loading} />
          ) : (
            <div className="empty-state compact-empty">
              <CheckCircle2 size={30} />
              <span>Select a goal to assign people, set priority, and map GitHub paths.</span>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Repository</h2>
              <p>Connect a repo, invite collaborators, and sync structure.</p>
            </div>
          </div>
          <form className="repo-form" onSubmit={handleConnectRepo}>
            <input placeholder="owner" value={repoForm.owner} onChange={(event) => setRepoForm({ ...repoForm, owner: event.target.value })} />
            <input placeholder="repo" value={repoForm.repo} onChange={(event) => setRepoForm({ ...repoForm, repo: event.target.value })} />
            <input placeholder="branch" value={repoForm.branch} onChange={(event) => setRepoForm({ ...repoForm, branch: event.target.value })} />
            <button className="secondary" disabled={loading || !repoForm.owner || !repoForm.repo}>
              <Github size={18} />
              Connect
            </button>
          </form>
          {integration && (
            <div className="integration-summary">
              <strong>
                {integration.owner}/{integration.repo}
              </strong>
              <span>{integration.isPrivate ? 'Private' : 'Public'} repository on {integration.branch}</span>
            </div>
          )}
          <form className="repo-form" onSubmit={handleInviteCollaborator}>
            <input
              placeholder="GitHub username or team email"
              value={inviteForm.usernameOrEmail}
              onChange={(event) => setInviteForm({ ...inviteForm, usernameOrEmail: event.target.value })}
            />
            <select
              value={inviteForm.permission}
              onChange={(event) => setInviteForm({ ...inviteForm, permission: event.target.value as typeof inviteForm.permission })}
            >
              <option value="pull">Pull</option>
              <option value="push">Push</option>
              <option value="maintain">Maintain</option>
            </select>
            <button className="secondary" disabled={loading || !integration}>
              <Users size={18} />
              Invite
            </button>
          </form>
          <button className="ghost" type="button" onClick={handleSyncCollaborators} disabled={loading || !integration}>
            <RefreshCw size={16} />
            Sync collaborators
          </button>
          <div className="collaborator-list">
            {(integration?.collaborators ?? []).map((collaborator) => (
              <div className="collaborator-row" key={`${collaborator.username}-${collaborator.email}`}>
                <span>{collaborator.username || collaborator.email}</span>
                <small>{collaborator.invitationStatus}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Member Workload</h2>
          <div className="member-progress-list">
            {(overview?.memberProgress ?? []).map((entry) => (
              <div className="member-progress-row" key={entry.member._id}>
                <span>{entry.member.name}</span>
                <strong>{entry.progress}%</strong>
                <div className="progress-track">
                  <div style={{ width: `${entry.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
          <h3>Assignments</h3>
          <div className="mini-list">
            {assignments.slice(0, 8).map((assignment) => (
              <div className="mini-row" key={assignment._id}>
                <span>{assignment.goal?.title}</span>
                <small>{assignment.assignedTo?.name} · {formatLabel(assignment.status)}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Activity Timeline</h2>
          <div className="event-stack">
            {activities.map((activity) => (
              <div className="event-item" key={activity._id}>
                <strong>{formatLabel(activity.action.replace(/\./g, ' '))}</strong>
                <span>{activity.actor?.name ?? 'System'} · {new Date(activity.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Notifications</h2>
          <div className="event-stack">
            {notifications.slice(0, 8).map((notification) => (
              <div className={`event-item ${notification.readAt ? '' : 'unread'}`} key={notification._id}>
                <strong>
                  <Bell size={14} />
                  {notification.title}
                </strong>
                <span>{notification.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GoalTreeItem({
  goal,
  selectedGoalId,
  onSelect,
  onDragStart,
  onDrop,
  onDelete
}: {
  goal: GoalNode;
  selectedGoalId?: string;
  onSelect: (goalId: string) => void;
  onDragStart: (goalId: string) => void;
  onDrop: (goalId: string) => void;
  onDelete: (goalId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(goal.children?.length);

  return (
    <div className="goal-tree-item">
      <div
        className={`goal-tree-row ${selectedGoalId === goal._id ? 'active' : ''}`}
        draggable
        onDragStart={() => onDragStart(goal._id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.stopPropagation();
          onDrop(goal._id);
        }}
      >
        <button className="icon-button" type="button" onClick={() => setExpanded((current) => !current)}>
          {hasChildren ? expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <span />}
        </button>
        <button className="goal-title-button" type="button" onClick={() => onSelect(goal._id)}>
          <span>{goal.title}</span>
          <small>{formatLabel(goal.type)} · {goal.progressPercentage}%</small>
        </button>
        <span className={`status ${goal.completionStatus}`}>{formatLabel(goal.completionStatus)}</span>
        <button className="icon-button danger" type="button" onClick={() => onDelete(goal._id)}>
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && hasChildren && (
        <div className="goal-children">
          {goal.children?.map((child) => (
            <GoalTreeItem
              key={child._id}
              goal={child}
              selectedGoalId={selectedGoalId}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalDetailForm({
  goal,
  teamMembers,
  onSubmit,
  loading
}: {
  goal: GoalNode;
  teamMembers: Team['members'];
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <form className="goal-detail-form" onSubmit={onSubmit} key={goal._id}>
      <div className="panel-heading">
        <div>
          <h2>Goal Details</h2>
          <p>Assign ownership, path mapping, and progress controls.</p>
        </div>
      </div>
      <label>
        Title
        <input name="title" defaultValue={goal.title} required />
      </label>
      <div className="form-grid">
        <label>
          Type
          <select name="type" defaultValue={goal.type}>
            {nodeTypes.map((type) => (
              <option key={type} value={type}>
                {formatLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="completionStatus" defaultValue={goal.completionStatus}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select name="priority" defaultValue={goal.priority}>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {formatLabel(priority)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deadline
          <input name="deadline" type="datetime-local" defaultValue={goal.deadline ? goal.deadline.slice(0, 16) : ''} />
        </label>
      </div>
      <label>
        Description
        <textarea name="description" defaultValue={goal.description} />
      </label>
      <label>
        GitHub path
        <input name="githubPath" defaultValue={goal.githubPath} placeholder="backend/auth" />
      </label>
      <label>
        Required files
        <input name="requiredFiles" defaultValue={(goal.requiredFiles ?? []).join(', ')} placeholder="index.ts, auth.routes.ts" />
      </label>
      <div className="form-grid">
        <label>
          Progress
          <input name="progressPercentage" type="number" min={0} max={100} defaultValue={goal.progressPercentage} />
        </label>
        <label className="checkbox-label">
          <input name="manualProgressOverride" type="checkbox" defaultChecked={goal.manualProgressOverride} />
          Manual override
        </label>
      </div>
      <div className="assignee-box">
        <strong>Assignees</strong>
        {teamMembers.map((member) => (
          <label className="checkbox-label" key={member.user._id}>
            <input
              type="checkbox"
              name="assignedMembers"
              value={member.user._id}
              defaultChecked={(goal.assignedMembers ?? []).some((assigned) => assigned._id === member.user._id)}
            />
            {member.user.name}
          </label>
        ))}
      </div>
      <button className="primary" disabled={loading}>
        {loading ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
        Save Goal
      </button>
    </form>
  );
}

function ManagementMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatHealth(value?: ManagementOverview['health']) {
  if (!value) return 'No Data';
  return formatLabel(value);
}
