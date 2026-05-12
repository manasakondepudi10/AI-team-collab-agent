# AI Team Collab Agent

AI Team Collab Agent is a Dockerized MERN platform for student project teams. It creates structured projects, assigns roles from team skills, tracks tasks and milestones, and integrates with GitHub commits, pull requests, merges, and webhooks.

## Run

```bash
cp .env.example .env
docker compose up --build
```

Open:

- Frontend: http://localhost:5173
- API health: http://localhost:5000/api/health

## Demo Login

The backend seeds a demo owner on first boot:

- Email: `demo@collab.ai`
- GitHub username: `demo-lead`
- Password: `Password123!`

New users start with **Continue with GitHub**. After GitHub redirects back, the app stores the GitHub account details and access token in MongoDB, then signs the user in.

Logged-in users can open the GitHub page and use **Set Password**. After that, they can sign in directly with their email or GitHub username plus the app password.

## GitHub Setup

Create an OAuth app in GitHub and put these values in `.env`:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`

Set the OAuth callback URL to:

```text
http://localhost:5000/api/github/callback
```

For repository webhooks, point GitHub to:

```text
http://localhost:5000/api/github/webhook
```

Subscribe to `push`, `pull_request`, and `ping`.

## Groq Planner Setup

The Create Project page uses Groq's OpenAI-compatible chat completions API.

Add these to `.env`:

```env
GROQ_API_KEY=your-real-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
```

If `GROQ_API_KEY` is empty, the app still returns a basic fallback architecture plan so the screen does not break.

After editing `.env`, restart:

```bash
docker compose up --build
```

## Architecture

- `server`: Express, TypeScript, MongoDB/Mongoose, JWT auth, project/team management, GitHub OAuth, sync, and webhook ingestion.
- `client`: Vite, React, TypeScript, professional dashboard UI with project generation, team skill inputs, GitHub insights, and admin-ready sections.
- `docker-compose.yml`: MongoDB, API, and frontend with hot reload for development.

## Team Goal & Project Management

The new goal-management system is isolated under `/api/project-management` and the frontend `Goals` view. It adds nested goal trees, assignments, GitHub repository connection, collaborator invitations, progress syncing, activity logs, and in-app notifications without replacing existing auth, GitHub login, project APIs, or the architecture chatbot.

Run the index migration after pulling the feature:

```bash
npm --prefix server run migrate
```

More details: [docs/project-management.md](docs/project-management.md)
