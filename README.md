# StrativyFlow — Backend

Backend principal do CRM StrativyFlow: leads, negociações, conversas (WhatsApp/Messenger/Instagram),
follow-ups, pagamentos e automações comerciais.

NestJS 11 + TypeORM/Postgres + RabbitMQ + Socket.IO. Um único código, **dois processos**:

| Processo | Entrada | Função |
| --- | --- | --- |
| API HTTP | `src/main.ts` | REST + Socket.IO (namespace `/realtime`) |
| Worker | `src/worker.ts` (`src/worker.module.ts`) | Schedulers (cron) e consumidores RabbitMQ de notificações e pagamentos |

Os dois usam o mesmo banco Postgres. Os tokens JWT são emitidos pelo serviço de usuários
(`elciess.ms.users`) e validados aqui com o mesmo `JWT_SECRET`.

## Requisitos

- Node.js 20+
- Postgres e RabbitMQ locais — os arquivos `docker-postgres.yml` e `docker-rabbitmq.yml`
  ficam em `../elciess.ms.users/`

## Configuração

As variáveis são lidas de `.env.${NODE_ENV}` (`.env.dev`, `.env.prod`), que não são versionados.

| Grupo | Variáveis |
| --- | --- |
| App | `PORT`, `CORS_ORIGIN`, `JWT_SECRET` |
| Banco | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SYNCHRONIZE`, `DB_MIGRATIONS_RUN` |
| RabbitMQ | `RABBITMQ_ENABLED`, `RABBITMQ_URL`, `RABBITMQ_QUEUE`, `RABBIT_PREFETCH`, `RABBIT_PUBLISH_CONCURRENCY`, `RABBIT_MAX_RETRY_ATTEMPTS`, `RABBIT_RETRY_DELAYS_MS` |
| E-mail | `RESEND_API_KEY` |
| Storage (R2) | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_REGION` |
| WhatsApp (Meta) | `WHATSAPP_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN` |
| Webhooks Meta | `META_APP_SECRET` (obrigatória; App Secret do app da Meta, ou vários separados por vírgula, usada para validar o `X-Hub-Signature-256`) |
| Evolution API | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` (obrigatórias na API e no worker) |
| IA | `OPENAI_API_KEY` |

## Comandos

```bash
npm install
npm run start:dev          # API em watch (NODE_ENV=dev)
npm run start:worker:dev   # worker em watch
npm run build
npm run start:prod         # API (NODE_ENV=prod, dist/main)
npm run start:worker       # worker (NODE_ENV=prod, dist/worker.js)
npm run lint
npm run format
npm test
npm run test:cov
```

## Estrutura

- `src/modules/<área>/` — um módulo Nest por área de negócio (`leads`, `negotiation`, `followup`,
  `financeiro`, `webhook`, `notification`, `reminder`, `company`, `contacts`,
  `dashboard`, `storage`, `realtime`, `rabbit`, `mail`, `evolution`, `user`, `auth`).
- `src/worker/` — schedulers e workers de notificações e pagamentos.
- `src/database/migrations/` — migrations TypeORM (`<timestamp>-<NomePascalCase>.ts`, cada uma com seu `.spec.ts`).
  Mudanças de schema sempre por migration; não use `DB_SYNCHRONIZE=true` para isso.

## Testes

Testes unitários ficam junto do código (`*.spec.ts`). O `test/app.e2e-spec.ts` ainda é o
exemplo padrão do Nest e não reflete as rotas reais.
