# Padrão de testes — strativy.service.flow

Este documento define como os testes do backend são escritos. Vale para todo código
novo e para todo spec que for alterado. Specs antigos migram para o padrão quando
forem tocados; não é preciso reescrevê-los de uma vez.

## Níveis

| Nível | Arquivo | Onde | Script | Para quê |
| --- | --- | --- | --- | --- |
| Unitário | `*.spec.ts` | Ao lado do código, em `src/` | `npm test` | Regra de negócio de services, mappers, policies, guards e utils. Rápido, sem banco nem rede. |
| Integração | `*.int-spec.ts` | Ao lado do código, em `src/` | `npm run test:int` | Repositories e queries com Postgres real; consumers com RabbitMQ real. |
| E2E (HTTP) | `*.e2e-spec.ts` | `test/e2e/` | `npm run test:e2e` | Request real via supertest, passando por guards, pipes, filtros de erro e isolamento de tenant. |

O CI (`.github/workflows/ci.yml`) roda `lint:check`, os testes unitários e o build em todo
push para `main` e `big-refactor-backend` e em todo pull request. Integração e E2E entram no
CI quando os primeiros testes desses níveis existirem.

## Estrutura de um teste

```ts
describe('AutomationRuleService', () => {
  describe('findAll', () => {
    it('returns only the rules of the user company', async () => {
      // Arrange
      const repository = createMockRepository<AutomationRule>()
      repository.find.mockResolvedValue([buildAutomationRule()])
      const service = new AutomationRuleService(repository)

      // Act
      const rules = await service.findAll(FIXTURE_IDS.user)

      // Assert
      expect(rules).toHaveLength(1)
    })
  })
})
```

- `describe` da classe, depois `describe` do método.
- `it` descreve o comportamento, em inglês, sem "should": `returns ...`, `rejects ... when ...`.
- Um comportamento por `it`, separado em Arrange / Act / Assert.
- Nada de lógica condicional dentro do teste. Para variações, use `it.each`.

## Helpers compartilhados (`src/testing`)

Importe de `src/testing` (fica fora do build de produção):

- `createMockRepository<T>()`: repository do TypeORM em que todos os métodos comuns são
  `jest.fn()`. `create` devolve o próprio input.
- Factories `buildCompany`, `buildUserInformations`, `buildLead`, `buildMessage`: entidades
  válidas com valores padrão, que aceitam overrides (`buildLead({ companyId })`).
- `FIXTURE_IDS`: UUIDs estáveis (`company`, `otherCompany`, `user`, `otherUser`, ...). Use UUIDs
  reais porque os guards validam o formato.
- `FIXED_DATE`: data fixa para fixtures.

Ao precisar de uma entidade que ainda não tem factory, crie a factory em
`src/testing/factories.ts` em vez de montar o objeto dentro do spec.

## Como montar o objeto testado

- **Services, mappers, policies e workers:** instancie a classe direto, passando os mocks no
  construtor. É o padrão do projeto e mantém o teste rápido e explícito.
- **Guards, interceptors, pipes, montagem de módulos e E2E:** use `Test.createTestingModule`,
  porque o comportamento depende do container do Nest.

## Dependências externas

- Clientes de serviços externos (Meta Graph API, Evolution, R2, Resend, OpenAI) são mockados
  trocando o provider injetado por token, não com `jest.mock('axios')`. Integrações que ainda
  chamam `axios` direto migram para clientes injetáveis durante o refactor.
- Tempo: use `jest.useFakeTimers().setSystemTime(...)` com data fixa e restaure em `afterEach`.
- Nenhum teste unitário acessa rede, banco ou sistema de arquivos.

## Regras obrigatórias

1. **Bug corrigido ganha teste de regressão** que falha antes da correção.
2. **Correção de segurança ganha matriz de acesso**:
   - sem token → `401`;
   - recurso de outra empresa → `404` (o projeto responde `NotFoundException('Resource not found')`);
   - recurso da própria empresa → sucesso.
3. **Migration ganha spec** que mocka `QueryRunner.query` e confere o SQL de `up` e `down`
   (veja `1791504000000-AddMessengerInstagramFieldsToCompanies.spec.ts`).
4. **Todo service, worker, guard ou DTO com lógica alterado ganha ou atualiza spec.**

## Cobertura

Não há meta global de cobertura enquanto o código legado não estiver coberto. A cobertura é
cobrada nos arquivos alterados em cada mudança e vira quality gate quando o SonarCloud entrar
no CI.
