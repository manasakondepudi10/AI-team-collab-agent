# Team Goal & Project Management System

This feature is added as an isolated module and does not replace auth, GitHub auth, project creation, or the architecture chatbot.

## Backend

Base route:

```text
/api/project-management
```

Core endpoints:

- `GET /projects/:projectId/goals`
- `POST /projects/:projectId/goals`
- `PATCH /goals/:goalId`
- `DELETE /goals/:goalId`
- `POST /goals/:goalId/assign`
- `GET /projects/:projectId/assignments`
- `GET /projects/:projectId/overview`
- `GET /github/repositories`
- `POST /projects/:projectId/github/repository`
- `POST /projects/:projectId/github/invite`
- `POST /projects/:projectId/github/collaborators/sync`
- `POST /projects/:projectId/progress/sync`
- `GET /notifications`
- `PATCH /notifications/:notificationId/read`

## Data Model

New collections:

- `goalnodes`: unlimited-depth goal tree using `parentId`
- `assignments`: member-specific assignment records
- `githubintegrations`: repository connection and collaborator state
- `activitylogs`: audit timeline
- `notifications`: in-app notifications

Run index sync:

```bash
npm --prefix server run migrate
```

## GitHub Progress Logic

The progress engine scans the connected repository tree.

- Path exists: at least 50%
- Required files exist: up to 80%
- Task path exists or all required files exist: 100%
- Parent folders also reflect child progress
- Manual override prevents automatic overwrite

## Environment

Required for private repository sync and collaborator invites:

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=
```

Users must connect GitHub through OAuth before repository operations can use their token.

## Frontend

The new UI is mounted as the `Goals` dashboard view. It supports:

- Nested goal creation
- Native drag-and-drop reparenting
- Member assignment
- Status, priority, deadline, description
- GitHub path mapping and required files
- Repository connect, collaborator invite, collaborator sync
- GitHub progress sync
- Team workload, activity timeline, and notifications
