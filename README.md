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

Existing users can sign in with either their email or connected GitHub username plus their app password.

New users register through GitHub OAuth. The app creates a pending registration, sends the user to GitHub, verifies that the authorized GitHub username matches the requested username, and confirms the entered email exists as a verified email on that GitHub account before saving the user.

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

## Email Verification Setup

New user registration first sends a 6-digit email OTP. If SMTP is not configured, the app still works in development and prints the OTP in API logs:

```bash
docker compose logs api --tail 80
```

For real emails with Gmail, create a Gmail app password and set:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM="AI Team Collab Agent <your-gmail-address@gmail.com>"
EMAIL_VERIFICATION_TTL_MINUTES=10
```

After editing `.env`, restart:

```bash
docker compose up --build
```

## Architecture

- `server`: Express, TypeScript, MongoDB/Mongoose, JWT auth, project/team management, GitHub OAuth, sync, and webhook ingestion.
- `client`: Vite, React, TypeScript, professional dashboard UI with project generation, team skill inputs, GitHub insights, and admin-ready sections.
- `docker-compose.yml`: MongoDB, API, and frontend with hot reload for development.
