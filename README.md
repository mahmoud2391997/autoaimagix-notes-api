# Autoaimagix Notes API

A small Express 4 REST API with JWT authentication, PostgreSQL notes, owner/admin authorization, and authenticated Open-Meteo access. Requires Node.js 20+.

## Architecture

`api/index.js` exports the Express application for Vercel; `src/server.js` runs it locally. Routes validate requests and call thin controllers. Services contain business logic and scoped Prisma queries. Shared middleware authenticates users, limits logins, and serializes errors. Environment validation fails before serving requests.

## Local setup

Local development uses PostgreSQL 17, Redis 7, and an authenticated Redis REST bridge through Docker, independently of Neon and Upstash. The bridge lets the same Upstash SDK and rate-limiter code run against local Redis. Install and start Docker Desktop, then run:

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:push
npm run db:seed
npm run test:db
npm run test:local
npm run dev
```

`setup:local` creates `.env` with random database, JWT, and admin credentials and restrictive file permissions. It preserves existing values in `.env` and fills missing local Redis settings. Find the generated admin email/password in `.env`; never commit or share this file.

PostgreSQL listens only on `127.0.0.1:5433`; the token-protected Redis REST bridge listens only on `127.0.0.1:8079`. Redis itself has no host port. Both databases persist data in named Docker volumes. The generated local Redis token is shared between `LOCAL_REDIS_TOKEN` for the bridge and `UPSTASH_REDIS_REST_TOKEN` for the API; keep them consistent. `npm run db:down` stops the database without deleting its data. If you already run native PostgreSQL, create an empty database and set `DATABASE_URL` in `.env` instead; Docker is optional in that case. Keep `LOCAL_POSTGRES_PASSWORD` consistent with the URL when using Compose. Changing it later does not reset the password in an existing volume.

The API listens on port 3000 by default. Health checks do not verify database connectivity. `db:push` is suitable for this assessment; review schema changes carefully before applying them to a database with existing data.

## Remote Neon database

The dedicated `autoaimagix-notes-api` Neon resource has been provisioned on the free plan in Frankfurt. Account verification is complete. The Prisma schema and admin seed have been applied, and the database-backed API smoke test passes against this remote database.

Use a separate ignored `.env.neon` file for remote operations. Copy `.env.example` into it, replace `DATABASE_URL` with Neon's **pooled** URL with `sslmode=require`, add `DATABASE_URL_UNPOOLED` with its **direct** URL, and generate independent JWT/admin secrets. Local Docker credentials do not belong in Neon or Vercel. In `.env.neon`, leave the local Redis fields empty or configure remote HTTPS Redis credentials; do not copy the local bridge URL into production. Keep `NODE_ENV=development` in this administrative smoke-test file unless you also configure Upstash; the deployed API requires `NODE_ENV=production`.

```sh
npm run db:push:neon
npm run db:seed:neon
npm run test:db:neon
```

`db:push:neon` requires the direct URL and passes it only to the Prisma schema command; the API and smoke test use the pooled URL. `.env.neon` has independent JWT/admin credentials and never changes the local `.env`.

The database smoke script runs real API requests against Prisma and PostgreSQL, checks authentication and owner/admin CRUD, and removes only the temporary accounts it creates (with cascading note deletion). Run it against the dedicated assessment database, not a database with unrelated production workloads.

## Environment variables

| Variable                 | Meaning                                                         |
| ------------------------ | --------------------------------------------------------------- |
| NODE_ENV                 | development, test, or production                                |
| PORT                     | Local port; default 3000                                        |
| DATABASE_URL             | Local PostgreSQL URL or Neon pooled PostgreSQL URL with TLS     |
| DATABASE_URL_UNPOOLED    | Direct Neon URL used only by remote schema setup                |
| LOCAL_POSTGRES_PASSWORD  | Local Docker PostgreSQL password; ignored by the API            |
| LOCAL_REDIS_TOKEN        | Local Redis REST bridge token; must match the API Redis token   |
| JWT_SECRET               | Random secret of at least 32 characters                         |
| JWT_EXPIRES_IN           | Must be `1h`                                                    |
| CORS_ORIGINS             | Comma-separated exact HTTP(S) origins, without trailing slashes |
| UPSTASH_REDIS_REST_URL   | HTTPS Redis REST URL; required in production                    |
| UPSTASH_REDIS_REST_TOKEN | Redis REST token; required with the URL                         |
| ADMIN_EMAIL              | Admin seed email; normalized to lowercase                       |
| ADMIN_PASSWORD           | Seed password, 8–72 UTF-8 bytes, upper/lowercase and a digit    |

Admin seed variables are only necessary for the seed command. Do not keep them in the Vercel runtime after seeding unless needed. Re-running the seed resets the configured account password and promotes it to admin.

## Vercel deployment

Live API: [autoaimagix-notes-api.vercel.app](https://autoaimagix-notes-api.vercel.app/api/health). Production smoke tests passed for authentication, owner/admin note access, expired tokens, shared Redis rate limits, and live Cairo weather. Temporary test accounts were removed.

The `autoaimagix-notes-api` Vercel project is linked to the GitHub repository. Production uses the dedicated Neon database, a separate JWT secret, and Upstash Redis. Upstash Redis is provisioned on the free plan with paid auto-upgrades disabled. Vercel Marketplace injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; environment validation accepts these as aliases for the corresponding `UPSTASH_REDIS_REST_*` settings. Weather uses the public Open-Meteo API and requires no API key.

1. Create the Neon database; use the **pooled** URL for `DATABASE_URL`.
2. Create an Upstash Redis database and copy its REST URL/token.
3. Weather uses Open-Meteo, so no weather API key is needed.
4. Install the Vercel CLI and run `vercel link` from this directory. Choose the intended account and project. Use the Other framework preset, `npm run build`, and no static output directory.
5. Add the runtime environment variables from the table in the Vercel dashboard for each intended environment. Set `NODE_ENV=production`, use a newly generated JWT secret, and configure the actual client CORS origins. Upstash is mandatory in production.
6. In a trusted local shell, configure `.env` to point at the production database and provide the admin seed credentials. Run `npx prisma db push` and `npm run db:seed` **against that production database**. Do not paste secrets into command-line arguments or commit them.
7. Run `vercel --prod` and verify `/api/health`, register/login, and an ownership rejection against the resulting deployment.

The rewrite routes all paths to `/api`, whose entry exports the app. Prisma Client is generated at install/build time. Nothing is deployed automatically by this repository.

## Endpoints

All protected endpoints expect `Authorization: Bearer <token>`. Roles are `USER` and `ADMIN` in storage and responses.

| Method | Path                       | Access          | Success                  |
| ------ | -------------------------- | --------------- | ------------------------ |
| GET    | /api/health                | Public          | 200 `{status:"ok"}`      |
| POST   | /api/auth/register         | Public          | 201 `{user,token}`       |
| POST   | /api/auth/login            | Public, limited | 200 `{user,token}`       |
| GET    | /api/auth/me               | Authenticated   | 200 `{user}`             |
| POST   | /api/notes                 | Authenticated   | 201 `{note}`             |
| GET    | /api/notes?page=1&limit=20 | Owner/admin     | 200 `{notes,pagination}` |
| GET    | /api/notes/:id             | Owner/admin     | 200 `{note}`             |
| PATCH  | /api/notes/:id             | Owner/admin     | 200 `{note}`             |
| DELETE | /api/notes/:id             | Owner/admin     | 204                      |
| GET    | /api/weather?city=Cairo    | Authenticated   | 200 trimmed weather      |

Example requests (replace `TOKEN` and `NOTE_ID` with returned values):

```sh
BASE=http://localhost:3000
curl "$BASE/api/health"
curl -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d '{"email":"person@example.com","password":"ExamplePassword1"}'
curl -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"person@example.com","password":"ExamplePassword1"}'
TOKEN='paste-returned-token-here'
curl "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/api/notes" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"First note","content":"Hello"}'
curl "$BASE/api/notes?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
NOTE_ID='paste-returned-note-id-here'
curl "$BASE/api/notes/$NOTE_ID" -H "Authorization: Bearer $TOKEN"
curl -X PATCH "$BASE/api/notes/$NOTE_ID" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"Updated title"}'
curl -X DELETE "$BASE/api/notes/$NOTE_ID" -H "Authorization: Bearer $TOKEN"
curl "$BASE/api/weather?city=Cairo" -H "Authorization: Bearer $TOKEN"
```

Titles are 1–200 characters after trimming; content is 1–8000 characters, subject to the overall 10kb JSON body limit. PATCH requires at least one supported field. Pagination is positive decimal integers, page at most 1,000,000 and limit at most 100. Cities accept Unicode letters, spaces and hyphens, with at least one letter and at most 60 characters. Weather temperatures are °C and wind is metres per second.

Errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request input", "details": [{ "path": "email", "message": "Invalid email" }] } }`.

Statuses: 400 validation/malformed JSON, 401 missing/invalid authentication or credentials, 403 role/CORS denial, 404 inaccessible/missing note or city, 409 duplicate email, 413 oversized body, 429 login limit, 502 weather failure, 503 unavailable shared limiter, and 500 unexpected failure. Internal errors are sanitized in every environment.

## Security decisions

- **IDOR:** non-admin reads and writes query both `id` and authenticated `ownerId`. Inaccessible and missing notes return the same 404. Mutations include authorization in the atomic database operation. Admins may read, update, and delete any note; creating always assigns the current user.
- **JWT:** HS256 is pinned on verification, tokens expire in one hour, and application claims contain only `sub` and `role` (plus standard `iat`/`exp`). Each request reloads the current user and uses their database role, so deletion and role changes apply immediately.
- **Credentials:** bcryptjs uses cost 12. Password length is capped at bcrypt's 72 UTF-8 byte limit. Public selects exclude password hashes. Unknown-email logins still compare against a cost-12 dummy hash, and return the same 401 as a wrong password.
- **Mass assignment:** strict Zod schemas reject unexpected fields. Registration's explicitly permitted `role` field is discarded before the service is called; all registrations persist `USER`. All other unknown fields, including `id` and `ownerId`, are rejected. The authenticated identity controls ownership.
- **Login limiting:** five attempts per 15-minute fixed window per IP, including failed validation. Upstash shares state across serverless instances; production fails startup without it and fails closed on store failure/timeout. The default Docker development stack uses local Redis through an Upstash-compatible REST bridge. Unit tests and environments without Redis variables use express-rate-limit memory storage. HTTP Redis URLs are allowed only for loopback hosts outside production; production always requires HTTPS. Responses include `RateLimit-*`, and 429 includes `Retry-After`. Shared fixed windows are aligned to Upstash's clock, so bursts can straddle a window boundary.
- **Proxy:** `trust proxy=1` assumes exactly one trusted reverse proxy, as requested for Vercel. Restrict direct access to a self-hosted backend and adjust proxy trust to its topology before using this setting elsewhere.
- **Weather:** fixed HTTPS upstream, encoded city, five-second abort timeout, validated response and allowlisted output fields. Upstream errors never reach responses. City lookup and forecast share one five-second deadline. Weather data is provided by [Open-Meteo](https://open-meteo.com/) using its [geocoding](https://open-meteo.com/en/docs/geocoding-api) and [forecast APIs](https://open-meteo.com/en/docs). The public service is for non-commercial use; use a suitable commercial plan before commercial reuse.
- **HTTP:** Helmet, exact CORS allowlist, no-store responses, 10kb JSON limit, and central error serialization. CORS permits requests without an Origin header; authentication remains necessary. CORS is a browser policy, not access control.

## Verification

Verified locally: 25 tests pass, ESLint and formatting pass, Prisma Client generation succeeds, and the installation audit reports zero vulnerabilities. Tests ran on Node 22.23.1.

Prisma CLI/client are pinned together at 6.12.0 to retain the requested schema configuration without the dependency advisory affecting later Prisma 6 CLI releases. Zod and Vitest use patched versions. `.npmrc` disables automatic peer installation to avoid an npm 10 resolver crash involving optional browser tooling; Vite is explicitly declared for the test runner.

```sh
npm run lint
npm test
npm run build
npm run format:check
npm run test:local
```

Tests use Supertest against the actual Express middleware/routes/services with a mocked Prisma storage boundary and mocked weather fetch. They cover auth, bcrypt, JWT rejection, role reload, ownership query predicates, owner/admin CRUD, validation, rate-limit headers, sanitized errors, weather failures and CORS. They require no real credentials. The unit suite does not prove live service connectivity. `npm run test:db` additionally passed against local PostgreSQL 17, and `npm run test:db:neon` passed against the remote Neon database. Live Open-Meteo connectivity was verified for Cairo. Production Vercel/Upstash smoke tests passed, including distributed login limiting and live weather.

The local stack smoke test starts two separate API processes, verifies shared PostgreSQL CRUD, alternates login attempts between them, confirms attempt six is rate limited with retry headers, verifies the counter exists in Redis, and checks bridge authentication. It removes its own test account and Redis keys. It refuses non-loopback database or Redis targets. This test passed against the local Docker stack. The local REST bridge follows the [Upstash-recommended development approach](https://upstash.com/docs/redis/sdks/ts/developing). Its image is pinned by digest. Newer rate-limit SDKs add an Upstash-specific Lua header; a local-only SDK middleware removes that flag and remaps script hashes for native Redis. Production HTTPS clients do not use this adapter.

## Assumptions

- The pasted specification controls implementation; the attached assessment document is background, not an instruction to publish or fill in personal claims.
- Open-Meteo replaces OpenWeatherMap at the user's request; the external weather endpoint remains authenticated, with the same output fields.
- Registration ignores `role` as explicitly required, despite the general strict unknown-field rule.
- Production must use Upstash; memory fallback is for local development/tests only.
- Admins can update/delete any note. Existing roles are managed through the seed or trusted database administration.
- The GitHub repository and databases are separate from deployment. The original assessment's personal delivery report remains for the applicant to complete accurately.

## What I'd improve next

- Refresh tokens and session revocation.
- Account lockout with abuse-resistant recovery.
- Audit logs for privileged actions.
- OpenAPI documentation.
