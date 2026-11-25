ReachInbox Email Scheduler
A full-stack email campaign scheduler built with React, TypeScript,
Express, PostgreSQL, Redis, and BullMQ. It supports authenticated
workspaces, sender management, scheduled email campaigns, optional
attachments, delivery tracking, and integrations with Google OAuth,
Slack, Elasticsearch, and Bull Board.
Features
Authentication and workspaces
- Google OAuth 2.0 sign-in using the authorization-code flow.
- OAuth state validation and ID-token verification.
- Redis-backed HTTP sessions and protected APIs.
- Automatic workspace membership and logout.
- Workspace-scoped sender, campaign, and delivery data.
Campaign management
- Create and schedule email campaigns.
- Add recipients manually or import them from CSV, XLS, XLSX, or TXT
  files.
- Merge and deduplicate recipient addresses.
- Configure campaign start time, minimum delay, and hourly sending
  limit.
- Request idempotency to help prevent duplicate campaign creation.
- View paginated scheduled, sent, failed, and other delivery statuses.
Optional email attachments
Attachments are optional. Users can send campaigns without attaching any
files.

Supported categories and file types:
  Category                            Supported formats
  Documents                           PDF, DOC, DOCX, TXT

  Images                              JPG, JPEG, PNG, GIF, WEBP, SVG

  Videos                              MP4, AVI, MOV, MKV, WEBM

  Presentations                       PPT, PPTX

  Spreadsheets                        XLS, XLSX, CSV

  Programming                         JS, JAVA, PY, HTML, CSS, SQL, TS,
JSX, TSX, PHP, C, CPP, CS

  Data                                XML, JSON, YAML, YML
Compressed                          ZIP, RAR
Attachment features include drag-and-drop, multi-file selection,
replacement, and individual file removal.

Attachment limits: 10 MiB per file, 15 MiB total, and 20 files per
campaign. Attachment bytes are stored in PostgreSQL and attached to
scheduled emails by the worker.

Recipient import files are parsed in the browser. They are not uploaded
as email attachments. Imported non-email columns are retained as
recipient data but are not currently used for message personalization.
Recipient import has separate limits of 10 MiB per file, 15 MiB total,
and 20 files.
Reliable email scheduling
- PostgreSQL stores campaigns, deliveries, and durable outbox events.
- A recoverable outbox relay publishes jobs to BullMQ.
- Redis supports delayed jobs and atomic rate/delay reservations
  across workers.
- SMTP worker retries are configurable.
- Ambiguous SMTP outcomes are marked UNKNOWN rather than
  automatically retried, reducing the risk of duplicate emails.
Integrations
- Google OAuth: sign-in and session authentication.
- SMTP: sends scheduled campaign emails.
- Slack: OAuth and campaign/delivery notifications, when
  configured.
- Elasticsearch: delivery indexing and search, when configured.
- Bull Board: authenticated queue dashboard at
  /api/admin/queues.
Technology stack
  Layer                Technologies
  Frontend             React, TypeScript, Vite, Tailwind CSS
Backend              Node.js, Express, TypeScript
Database             PostgreSQL, Prisma ORM
Queue and sessions   Redis, BullMQ
Email                SMTP
Authentication       Google OAuth 2.0
Search               Elasticsearch (optional)
Notifications        Slack (optional)
Queue monitoring     Bull Board
Prerequisites
Install or provision:
- Node.js 20.19+ or 22.12+
- npm
- PostgreSQL 16+
- Redis 7+
- Google OAuth credentials
- SMTP credentials for the email worker
Elasticsearch and Slack are optional until you configure those
integrations.

For Redis, enable AOF persistence (appendonly yes,
appendfsync everysec) or the equivalent persistence setting offered by
your managed Redis provider.
Project structure
The project has separate frontend and backend applications:
reachinbox-email-scheduler/
├── backend/
│   ├── .env.example
│   ├── prisma/
│   └── src/
├── frontend/
│   └── src/
└── README.md
Your exact source folders may contain additional modules and files.
Local setup
1. Get the project ready
Open a terminal in the project root. Make sure PostgreSQL and Redis are
running. Create a PostgreSQL database named reachinbox.
2. Configure backend environment variables
In PowerShell:
Copy-Item backend\.env.example backend\.env
Generate a secure session secret:
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
Copy the generated value into SESSION_SECRET in backend\.env.

Set the required connection strings and credentials in backend\.env:
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/reachinbox"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="YOUR_GENERATED_SECRET"

GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_CALLBACK_URL="http://localhost:4000/api/auth/google/callback"
FRONTEND_URL="http://localhost:5173"
The example above illustrates the local configuration. Keep the actual
values from your services, and do not commit backend\.env or other
files containing secrets.

Configure the SMTP, worker, and rate-limit variables using the names and
examples in backend\.env.example. The worker requires its settings and
SMTP credentials before it will start.
3. Install backend dependencies and prepare the database
cd backend
npm install
npm run db:generate
npm run db:migrate
These commands install backend packages, generate the Prisma client, and
apply pending database migrations, including the campaign attachment
migration.
4. Start the backend API
In the backend directory:
npm run dev
The API runs at:
http://localhost:4000
5. Start the frontend
Open a second terminal:
cd frontend
npm install
npm run dev
The Vite development server normally runs at:
http://localhost:5173
6. Start the email worker
Configure the SMTP and worker settings in backend\.env, then open
another terminal:
cd backend
npm run dev:worker
The worker processes scheduled delivery jobs. It refuses to start when
required configuration is missing.
Google OAuth configuration
1. Open the Google Cloud Console.
2. Create or select a Google Cloud project.
3. Configure the OAuth consent screen.
4. Create an OAuth client ID and select Web application.
5. Add this authorized redirect URI:
   http://localhost:4000/api/auth/google/callback
6. Copy the client ID and client secret into GOOGLE_CLIENT_ID and
   GOOGLE_CLIENT_SECRET in backend\.env.
7. Make sure GOOGLE_CALLBACK_URL exactly matches the redirect URI
   registered in Google Cloud.
8. Set FRONTEND_URL to http://localhost:5173 for local development.
The login flow requests the openid, email, and profile scopes.
API overview
The following endpoints require a signed-in Google session unless stated
otherwise. Campaign and delivery data are scoped to the session's
workspace.
  Method                  Endpoint                                                     Purpose
  GET                     /                                                          API service information

  GET                     /api/health/live                                           Liveness check

  GET                     /api/health/ready                                          PostgreSQL and Redis
readiness

  POST                    /api/senders                                               Create a sender
identity

  GET                     /api/senders                                               List workspace senders

  POST                    /api/campaigns                                             Create a campaign

  GET                     /api/campaigns?page=1&pageSize=25                          List campaigns

  GET                     /api/campaigns/:campaignId/deliveries?page=1&pageSize=25   List campaign
deliveries

  GET                     /api/deliveries?page=1&pageSize=25&status=SCHEDULED        List workspace
deliveries
GET                     /api/admin/queues                                          Bull Board queue
dashboard
Supported delivery status filters are:
- SCHEDULED
- PROCESSING
- SENT
- FAILED
- UNKNOWN
Campaign request
A campaign request includes:
- senderId
- subject
- body
- recipients
- scheduledStartAt (ISO-8601 date/time)
- minDelayMs
- maxPerHour
Recipient email addresses are normalized and deduplicated.
MAX_CAMPAIGN_RECIPIENTS controls the maximum number of recipients
accepted in a request.

Send a unique Idempotency-Key header with campaign creation requests.
This helps ensure that retrying the same request does not create
duplicate campaigns.

Existing JSON campaign requests are supported. Multipart requests place
the campaign JSON in a campaign form field and can include attachments
in these category fields:

documents, images, videos, presentations, spreadsheets,
programming, data, and compressed.
Optional integrations
SMTP
Configure the SMTP host, port, username, password, and sender details
using the environment variable names in backend\.env.example. Also
configure the worker concurrency, retry, and rate-limit settings.

The worker uses WORKER_CONCURRENCY, EMAIL_RATE_LIMIT_SCOPE,
EMAIL_MAX_PER_HOUR, EMAIL_MIN_DELAY_MS, and the retry settings.
Campaign limits cannot exceed the worker's hourly cap.
Slack
Create a Slack app, configure its OAuth settings and redirect URL to
match the backend configuration, and provide the required Slack
credentials and notification channel ID in backend\.env.

Invite the Slack app/bot to the destination channel if the app's
notification permissions require it.
Elasticsearch
Provide a reachable Elasticsearch URL or managed endpoint and the
required authentication configuration in backend\.env. When
configured, the application can index deliveries and provide delivery
search.
Bull Board
After the backend is configured and running, open:
http://localhost:4000/api/admin/queues
Access is restricted to authenticated workspace members.
Health checks and troubleshooting
Open these endpoints while the API is running:
- API information: http://localhost:4000/
- Liveness: http://localhost:4000/api/health/live
- Readiness: http://localhost:4000/api/health/ready
The readiness endpoint reports whether PostgreSQL and Redis are
available.

Common setup checks:
- Database connection error: confirm PostgreSQL is running, the
  reachinbox database exists, and DATABASE_URL contains the
  correct username, password, host, port, and database name.
- Redis connection error: confirm Redis is running and REDIS_URL
  is correct.
- Prisma errors: run npm run db:generate and
  npm run db:migrate from the backend directory.
- Google sign-in error: verify the client ID, client secret,
  consent-screen settings, and exact callback URL.
- Worker will not start: check all required worker, rate-limit,
  and SMTP environment variables.
- Emails are not being delivered: verify SMTP credentials and
  provider restrictions, then inspect backend and worker logs.
Email testing and delivery behavior
Use a test SMTP service such as Ethereal while developing. Ethereal
captures test messages so you can inspect them, but it does not
deliver them to real recipient inboxes.

For real inbox delivery, configure an authorized SMTP provider and test
with addresses you control. Confirm the provider's sending restrictions
and any domain authentication requirements before using production
recipients.

If the SMTP server may have accepted a message but the application loses
confirmation, the delivery is marked UNKNOWN and is not automatically
retried. This is intentional: retrying an ambiguous send could deliver a
duplicate email.
Security notes
- Never commit .env files, OAuth secrets, SMTP passwords, API keys,
  or session secrets.
- Use strong, unique secrets for deployed environments.
- Use HTTPS and secure cookie settings in production.
- Restrict access to administrative and queue-monitoring endpoints.
- Apply appropriate access controls to Slack and Elasticsearch
  credentials.
- Test with controlled recipients before sending real campaigns.
Deployment notes
The frontend and backend are separate services and may need separate
deployment configuration. PostgreSQL, Redis, and the email worker must
also be available in the deployed environment.

Before deploying:
1. Provision managed PostgreSQL and Redis services.
2. Configure all required backend environment variables in the hosting
   provider's secret/environment settings.
3. Set the production frontend URL and Google OAuth callback URL.
4. Add the production callback URL to the Google OAuth client's
   authorized redirect URIs.
5. Deploy the backend API and frontend.
6. Run database migrations as part of the deployment process.
7. Deploy and run the email worker as a separate long-running process.
8. Configure SMTP and test delivery using controlled recipient
   addresses.
9. Configure Slack and Elasticsearch only if those integrations are
   required.
10. Verify health checks, authentication, campaign creation, scheduling,
    queue processing, and delivery status.
A frontend deployment by itself is not sufficient. The API, database,
Redis service, and worker must all be configured and running for
end-to-end campaign scheduling and delivery.
Project status
Implemented foundation and application functionality includes:
- React/Vite frontend and Express/TypeScript backend.
- Prisma data model and PostgreSQL migrations.
- Google OAuth and Redis-backed sessions.
- Workspace-scoped sender and campaign APIs.
- Request idempotency and transactional outbox events.
- BullMQ delayed jobs, recoverable outbox relay, and SMTP worker.
- Redis-atomic rate and delay reservations.
- Dashboard, sender management, recipient import, optional categorized
  attachments, and delivery views.
- Slack OAuth/notifications, Elasticsearch indexing/search, and
  authenticated Bull Board integration behind provider configuration.
Configuration and live-service testing are still required. Google
OAuth and SMTP credentials, plus running PostgreSQL and Redis services,
are needed to test authenticated campaign creation and email delivery
end to end. Slack and Elasticsearch also require their respective
credentials/services.
License
Add your project's license and copyright information here.
