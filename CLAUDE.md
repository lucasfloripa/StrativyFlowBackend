# CLAUDE.md — strativy.service.flow

Main backend of the StrativyFlow CRM: leads, negotiations, WhatsApp/Messenger/Instagram
conversations, follow-ups, payments and commercial automations.

NestJS 11 + TypeORM/Postgres + RabbitMQ + Socket.IO, TypeScript 5.7, Node 20+.
One codebase, **two processes** sharing the same Postgres database:

| Process | Entry | Root module | Does |
| --- | --- | --- | --- |
| HTTP API | `src/main.ts` | `src/app.module.ts` | REST controllers + Socket.IO gateway (`/realtime`) + in-process crons (`ReminderModule`) |
| Worker | `src/worker.ts` | `src/worker.module.ts` | Cron schedulers that publish to RabbitMQ + RabbitMQ consumers (notifications, follow-ups, payments) |

Sibling repos (outside this one): `../strativy-flow-web` (React frontend) and
`../elciess.ms.users` (issues the JWTs this service verifies). See `../CLAUDE.md` for the workspace view.

## Commands

```bash
npm run start:dev          # API, watch (NODE_ENV=dev → .env.dev)
npm run start:worker:dev   # worker, watch (nest start --entryFile worker)
npm run build              # nest build (tsconfig.build.json excludes *spec.ts)
npm run lint               # eslint --fix (type-checked rules + prettier + import/order)
npm run format             # prettier on src/ and test/
npm test                   # jest, *.spec.ts under src/
npm run test:cov
```

Before finishing a change: `npm run lint`, `npm test`, `npm run build`.
CI (`.github/workflows/ci.yml`) runs `npm run lint:check` (no `--fix`), `npm test` and
`npm run build` on every push to `main` / `big-refactor-backend` and on pull requests.
There is no migration CLI script; migrations run on boot when `DB_MIGRATIONS_RUN=true`.

Local Postgres and RabbitMQ: `../elciess.ms.users/docker-postgres.yml` and `docker-rabbitmq.yml`.

## Configuration

- `DatabaseModule` loads `.env.${NODE_ENV || 'dev'}` with `ConfigModule.forRoot({ isGlobal: true })`.
  Env files are gitignored — never commit them or print their values; refer to variables by name.
- `main.ts` throws at boot if `CORS_ORIGIN` or `PORT` is missing.
- Required at module init via `configService.getOrThrow`: `R2_*` (StorageModule),
  `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` (EvolutionModule — used by the
  API through `ReminderModule` and by the worker). `MailService` throws without `RESEND_API_KEY`.
- Some code reads `process.env` directly (`JWT_SECRET` in `JwtAuthGuard`, `WHATSAPP_VERIFY_TOKEN`
  in `WebhookController`, `OPENAI_API_KEY`, `RABBIT_*` tuning). Prefer `ConfigService` in new code.
- Full variable list: `README.md` → Configuração.

## Layout

```
src/
  main.ts, app.module.ts          # API bootstrap: global ValidationPipe, CORS
  worker.ts, worker.module.ts     # worker bootstrap (createApplicationContext, no HTTP)
  database/
    database.module.ts            # TypeORM Postgres, autoLoadEntities, migrations glob
    migrations/                   # <timestamp>-<PascalCaseName>.ts + .spec.ts
  modules/<area>/                 # one Nest module per business area
  worker/notifications/           # follow-up/reminder schedulers + notification worker
  worker/payments/                # overdue-payment scheduler + payment worker
```

Business areas in `modules/`: `leads` (leads, messages, channel identities, outbound sending),
`negotiation` (deals, financial, costs, payments, attachments), `financeiro` (financial reports),
`followup` (follow-ups, steps, message templates, execution), `webhook` (inbound Meta webhooks,
lead flow engine, AI replies), `automation` (rules, triggers, actions), `notification`, `reminder`
(API-side crons), `company`, `contacts`, `dashboard`, `user`, `auth`, `storage` (R2), `realtime`
(Socket.IO), `rabbit`, `mail` (Resend), `evolution`.

Inside a module: `<area>.module.ts`, `<area>.controller.ts` (or `controllers/`), `<area>.service.ts`
(or `services/`), `dto/` (some modules use `dtos/` — follow the folder already there),
`entities/`, `mappers/`, `utils/`, `interfaces/`, `enums/`. Files are kebab-case:
`negotiation-payment.service.ts`, `create-negotiation-payment.dto.ts`.

## Patterns to follow

### Controllers and auth

- Every user-facing controller uses `@UseGuards(JwtAuthGuard)`. The guard verifies the Bearer
  token with `JWT_SECRET` and sets `request.user = { id, userId, role }`.
- Controllers declare a local `AuthenticatedRequest = Request & { user: { id: string } }` and pass
  `request.user.id` as the **first argument** to the service. Services scope every query by that user.
- Routes that take ids of company-owned resources add `CompanyAccessGuard`
  (`@UseGuards(JwtAuthGuard, CompanyAccessGuard)`). It checks any `leadId`, `negotiationId`,
  `attachmentId`, `followUpId`, `parentId`, `replyMessageId`, `costId`, `paymentId` in params, query or
  body (plus nested `steps` / `primaryStep` / `automationSteps`), and `:id` when the handler declares
  `@CompanyResourceAccess('<resource>')`. Import `CompanyAccessModule` in the feature module.
  A new resource type must be added to `resources` in `company-access.service.ts` and to
  `references` in `company-access.guard.ts`.
- Webhook routes (`/webhook/whatsapp|messenger|direct`) are public by design; GET handlers do the
  Meta `hub.verify_token` handshake.

### DTOs and validation

- Request bodies are `class-validator` DTO classes with `!` / `?` property markers.
- The global `ValidationPipe` (`main.ts`) returns
  `400 { error: 'Validation Error', fields: { [property]: firstMessage } }`. Keep that shape.
- Response DTOs and `mappers/` exist in several modules; map entities rather than returning
  relations you didn't mean to expose.

### Entities and migrations

- Entities: `@Entity('<snake_plural>')`, `@PrimaryGeneratedColumn('uuid')`, explicit `type` on
  columns, `timestamptz` for dates, `@CreateDateColumn` / `@UpdateDateColumn`, string enums
  exported next to the entity, money as `decimal(12,2)` typed `string`.
- Column naming is mixed: most columns use the default camelCase name (`companyId`, `dueDate`);
  some newer ones set `name: 'snake_case'` (`messenger_page_id`). Match the table you are editing.
- Entities register via `TypeOrmModule.forFeature([...])` and load through `autoLoadEntities`.
  A worker that touches an entity needs it in `WorkerModule`'s `forFeature` too.
- **Every schema change is a migration** in `src/database/migrations/`:
  file `<unixMillis>-<PascalCaseName>.ts`, class `<PascalCaseName><unixMillis>` with
  `name = '<same>'`, raw SQL in `up` and the exact reverse in `down`.
  Add `<same-file-name>.spec.ts` that mocks `QueryRunner.query` and asserts the SQL for `up` and
  `down` (see `1791504000000-AddMessengerInstagramFieldsToCompanies.spec.ts`).
  Never rely on `DB_SYNCHRONIZE=true` for schema changes.

### RabbitMQ (`modules/rabbit`)

- Publish with `RabbitPublisherService.publish(routingKey, payload)` or `publishMany(items)`.
  Messages are wrapped as `RabbitMessage { eventId, event, occurredAt, data }` on the topic
  exchange `strativyflow.events`.
- Consume with `RabbitConsumerService.subscribe({ queue, routingKey, handler })`, usually in a
  worker's `onModuleInit`. Handlers must **throw** on failure: the consumer retries through
  `strativyflow.retry` with delays from `RABBIT_RETRY_DELAYS_MS`, then dead-letters to
  `strativyflow.dead-letter`. Handlers must be safe to run more than once.
- Queue and event names live in `*-job.constants.ts` next to the worker
  (e.g. `payment.queue` / `payment.mark_overdue`, `notification.queue` / `lead.created`).
  Validate `message.data` defensively inside the handler (see `PaymentWorker.getPaymentId`).
- Schedulers use `@Cron(..., { waitForCompletion: true })`, find ids, then `publishMany`.

### Realtime

- Emit to the web app through `RealtimeService.emitToLead | emitToUser | emitBroadcast`;
  don't inject the gateway directly. The gateway authenticates sockets with the JWT and checks
  company access before joining lead rooms.

### External services

- Wrap each external API in its own injectable client configured through a provider token
  (`EVOLUTION_API_CONFIG`, `R2_S3_CLIENT`, `AI_PROVIDER`) so specs can replace it.
  `AIProvider` has `OpenAIProvider` and `FakeAIProvider`.
- Meta Graph API base URL: `buildMetaWhatsAppBaseUrl(WHATSAPP_API_VERSION)`. Per-company channel
  credentials (`whatsappToken`, `messengerToken`, `instagramToken`, page/account ids) are stored on
  `Company`; never log them.

### Logging and errors

- Use Nest `Logger` with `new Logger(ClassName.name)` and `key=value` context in messages
  (`paymentId=...`, `leadId=...`). Avoid `console.log` (a few legacy calls remain).
- Throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`)
  from services. Inaccessible resources surface as `NotFoundException('Resource not found')`.

## Tests

**Full standard: [`docs/testing.md`](docs/testing.md)** (levels, test structure, shared helpers,
mandatory rules). Summary:

- Levels: unit `*.spec.ts` (`npm test`), integration `*.int-spec.ts` (`npm run test:int`),
  E2E `test/e2e/*.e2e-spec.ts` (`npm run test:e2e`).
- Shared helpers live in `src/testing` (excluded from the build): `createMockRepository<T>()`,
  entity factories (`buildLead`, `buildCompany`, ...), `FIXTURE_IDS`, `FIXED_DATE`. Add a factory
  there instead of building fixtures inline.
- `describe(Class) > describe(method) > it('<behavior>')`, Arrange / Act / Assert.
- A fixed bug gets a regression test; a security fix gets an access matrix
  (no token → 401, other company → 404, own company → success).
- Jest 30 + ts-jest, `rootDir: src`, files `*.spec.ts` next to the code.
- Style used across the repo: instantiate the class directly with hand-written mocks, no Nest
  `TestingModule`. Repositories are cast as `as unknown as Repository<T>` and other collaborators
  as `as never`; build fixtures with `Object.assign(new Entity(), {...})` and fixed ISO dates.
- Add or update specs for every changed service, worker, guard, DTO with logic, and migration.
- `test/app.e2e-spec.ts` is still the Nest starter (expects `GET /` → "Hello World!") and does not
  reflect real routes.

## Code style

- Prettier: no semicolons, single quotes, no trailing commas, width 80, 2 spaces.
- ESLint (flat config, type-checked): `import/order` with groups
  builtin → external → internal → parent → sibling → index → object → type, a blank line between
  groups, alphabetized; `import type` goes last. `no-explicit-any` is a warning — avoid `any`.
- Domain names mix Portuguese and English (`financeiro`, `Negotiation`); keep the existing name
  of the area you touch.
- Large files — `webhook.service.ts` (~72 KB), `followup-executor.service.ts`,
  `followup-step-executor.service.ts`, `notification-worker.service.ts`, `leads.service.ts`:
  make targeted edits; don't reformat or restructure them unless asked.

## Commits and the refactor workflow

- Commit messages follow Conventional Commits (skill `conventional-commit-message`): pick the
  type by release impact (`feat`, `fix`, `perf` visible; `refactor`, `test`, `docs`, `ci`,
  `build`, `chore` hidden), lower-case changelog-ready subject, identifiers in backticks.
- The backend refactor runs on the `big-refactor-backend` branch, one commit per roadmap item;
  the PR to `main` is opened only at the end. Never push to `main` or force-push.
- Target architecture: modular, layered per feature module (controller → service →
  repository → entity), external integrations behind injection tokens, cross-cutting concerns
  in guards / interceptors / pipes / filters. Follow the `nestjs-best-practices` skill.
- Each roadmap item: write the failing test first, then the change; push; CI must be green;
  then mark the item done in the audit doc.

## Don'ts

- Don't commit, print or copy `.env*` values or company channel tokens.
- Don't change the JWT payload contract (`userId`, `role`) without updating `elciess.ms.users`.
- Don't add an endpoint that takes a resource id without `CompanyAccessGuard` coverage.
- Don't import a module into `WorkerModule` that pulls HTTP controllers or the gateway unless needed.
- Don't run migrations or scripts against non-local databases.

## Known issues (verified, not yet fixed)

- `test/app.e2e-spec.ts` targets a route that doesn't exist.
- `LeadsController` exposes `POST /leads/rabbit/publish-test`, a debug endpoint.
