# ReachInbox Email Scheduler

A full-stack email campaign scheduler built with React, Express, PostgreSQL, and Redis. The project is being implemented in phases.

## Implemented foundation and APIs

- Vite + React + TypeScript frontend scaffold with Tailwind CSS configured.
- Express + TypeScript API with liveness and dependency-readiness endpoints.
- Initial Prisma data model for workspaces, campaigns, deliveries, OAuth connections, idempotency, and outbox events.
- Google OAuth authorization-code flow with validated state and ID-token verification.
- Redis-backed HTTP sessions, protected session APIs, automatic workspace membership, and logout.
- Workspace-scoped sender and campaign APIs with validation, pagination, request idempotency, and transactional outbox events.
- BullMQ delayed delivery jobs, a recoverable outbox relay, SMTP worker retries, and Redis-atomic rate/delay reservations.
- Responsive authenticated dashboard with campaign statistics, sender management, manual and file-based recipient import, optional categorized email attachments, campaign composition, and paginated scheduled/sent/failed email views.
- Environment templates and secret-file exclusions.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm.
- PostgreSQL 16+ running locally or available through a managed service.
- Redis 7+ (or a compatible managed Redis endpoint).
- Elasticsearch is optional until configured; provide a URL or managed endpoint to enable delivery search and indexing.

## Local setup

1. Install and start PostgreSQL and Redis outside this project. Create a PostgreSQL database named `reachinbox`. Enable Redis AOF persistence (`appendonly yes`, `appendfsync everysec`) or the equivalent persistence setting from your managed Redis provider.

2. Copy the backend environment template, set connection strings for your services, and replace the session-secret placeholder:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Put the generated value in `SESSION_SECRET`. Set `DATABASE_URL` to your PostgreSQL connection string and `REDIS_URL` to your Redis endpoint in `backend\.env`. The template contains local-development examples; do not commit the populated `.env` file.

3. Install backend dependencies, generate the Prisma client, and apply the initial schema:

   ```powershell
   cd backend
   npm install
   npm run db:generate
   npm run db:migrate
   ```

4. In one terminal, start the API:

   ```powershell
   cd backend
   npm run dev
   ```

5. In another terminal, install frontend dependencies and start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

6. To run the email worker, configure the worker/rate-limit values and Ethereal SMTP credentials in `backend\.env`, then start it in a separate terminal:

   ```powershell
   cd backend
   npm run dev:worker
   ```

   The worker refuses to start if its required settings are missing. `WORKER_CONCURRENCY`, `EMAIL_RATE_LIMIT_SCOPE`, `EMAIL_MAX_PER_HOUR`, `EMAIL_MIN_DELAY_MS`, retry settings, and SMTP settings are environment-configured. Campaign limits cannot exceed the worker's hourly cap, and Redis performs the reservations atomically across workers.

The API root (`http://localhost:4000/`) returns service information. The liveness endpoint is `http://localhost:4000/api/health/live`. The readiness endpoint is `http://localhost:4000/api/health/ready` and reports PostgreSQL/Redis availability.

## Google OAuth setup

1. Create a Google OAuth 2.0 **Web application** client in Google Cloud.
2. Add `http://localhost:4000/api/auth/google/callback` as an authorized redirect URI.
3. Add the client ID and secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend\.env`.
4. Ensure `GOOGLE_CALLBACK_URL` exactly matches the registered URI and `FRONTEND_URL` is `http://localhost:5173` for local development.

The login flow uses the `openid`, `email`, and `profile` scopes. OAuth credentials are not included in the repository. The frontend shows sign-in as unavailable until the client ID and secret are configured.

## Campaign and sender APIs

These endpoints require a signed-in Google session and use the session's workspace for data isolation:

- `POST /api/senders` creates a workspace sender identity; `GET /api/senders` lists the current workspace's senders.
- `POST /api/campaigns` validates and creates a campaign, individual scheduled deliveries, and durable outbox events. Send a unique `Idempotency-Key` header so retries cannot create duplicate campaigns.
- `GET /api/campaigns?page=1&pageSize=25` lists campaigns for the current workspace.
- `GET /api/campaigns/:campaignId/deliveries?page=1&pageSize=25` lists a campaign's deliveries. An optional `status` filter accepts `SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, or `UNKNOWN`.
- `GET /api/deliveries?page=1&pageSize=25&status=SCHEDULED` lists workspace deliveries for the dashboard; the same status values are supported.

The campaign request includes `senderId`, `subject`, `body`, `recipients`, an ISO-8601 `scheduledStartAt`, `minDelayMs`, and `maxPerHour`. Recipient addresses are normalized and deduplicated. `MAX_CAMPAIGN_RECIPIENTS` limits request size. Existing JSON requests remain supported; multipart requests put the campaign JSON in a `campaign` form field and can include files in the category fields `documents`, `images`, `videos`, `presentations`, `spreadsheets`, `programming`, `data`, or `compressed`.

### Optional recipient files and email attachments

- Recipients can be typed manually, imported from one or more CSV, XLS, XLSX, or TXT files, or combined from both sources. Addresses are merged and deduplicated. Imported non-email columns are stored with each delivery as recipient data, but are not used for message personalization. Recipient files are parsed in the browser and are not uploaded or attached to the outgoing email.
- Email attachments are optional. The composer provides separate selectable categories for documents (PDF, DOC, DOCX, TXT), images (JPG, JPEG, PNG, GIF, WEBP, SVG), videos (MP4, AVI, MOV, MKV, WEBM), presentations (PPT, PPTX), spreadsheets (XLS, XLSX, CSV), programming files (JS, JAVA, PY, HTML, CSS, SQL, TS, JSX, TSX, PHP, C, CPP, CS), data files (XML, JSON, YAML, YML), and compressed files (ZIP, RAR). Drag-and-drop, multi-file selection, replacement, and individual removal are supported.
- Attachment limits are 10 MiB per file, 15 MiB total, and 20 files per campaign. Attachment bytes are stored in PostgreSQL with the campaign and attached to each scheduled email by the worker. If no attachment category is selected, emails are sent without attachments. The recipient-file import has its own optional 10 MiB per-file, 15 MiB total, and 20-file limits.
- `npm run db:migrate` applies the included campaign-attachment migration along with any other pending Prisma migrations; regenerate the Prisma client with `npm run db:generate` if needed.

The authenticated dashboard supports adding sender identities, composing campaigns with optional file inputs, viewing paginated scheduled and sent/failed deliveries, and searching indexed deliveries. Slack OAuth and notifications, Elasticsearch indexing/search, and Bull Board are implemented behind provider configuration.

Campaign scheduling is persisted in PostgreSQL and outbox records are created transactionally. The relay turns those records into BullMQ delayed jobs. The worker sends through the configured SMTP account. If SMTP may have accepted a message but confirmation was lost, the delivery is marked `UNKNOWN` and is not automatically retried, to avoid a possible duplicate. Ethereal is for test messages; it does not deliver to real recipient inboxes.

## Current scope

The dashboard, campaign composer, sender management, workspace delivery-list API, Slack OAuth/notifications, Elasticsearch indexing/search, and authenticated Bull Board dashboard are implemented. Google OAuth and SMTP credentials plus running PostgreSQL/Redis services are required to test authenticated campaign creation and message delivery end to end. Slack requires OAuth credentials and a notification channel; Elasticsearch requires a reachable URL; Bull Board is available at `/api/admin/queues` for authenticated workspace members.
