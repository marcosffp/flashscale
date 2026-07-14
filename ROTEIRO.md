# Roteiro de Desenvolvimento — Flash Sale Black Friday

> Guia pessoal de acompanhamento, baseado na seção 11 do [negocio.md](./negocio.md). Cada etapa vira um prompt que você manda pro Claude Code. Marque o checkbox quando a etapa estiver pronta (código + testes verdes + critério de validação confirmado).
>
> As skills em `.claude/skills/` já estão configuradas neste projeto — o Claude Code deve lê-las sozinho quando relevante, mas o "prompt sugerido" de cada etapa já cita a skill certa pra não depender disso.

## Como usar

1. Siga a ordem — a etapa 1 é o coração do projeto; se ela não sair, nada depois importa.
2. Copie o "Prompt sugerido" da etapa (ajuste se quiser) e mande pro Claude Code.
3. Confira os "Entregáveis" e o "Critério de pronto" antes de marcar o checkbox.
4. Se a etapa for grande, peça pra ele usar a skill `plan-feature` ou `breakdown-feature` antes de implementar — já está indicado abaixo em cada etapa que precisa disso.
5. Nunca cortar: teste de concorrência, idempotência, RBAC correto, NetworkPolicy, secrets (ver §11 do negocio.md — "nunca cortar"). Se o tempo apertar, corte na ordem: circuit breaker → OpenTelemetry → Helm → cloud.

---

## Progresso

- [x] Etapa 1 — `api` + Postgres local + concorrência de estoque
- [x] Etapa 2 — Idempotência completa em `POST /pedidos`
- [x] Etapa 3 — `gateway` com auth real + proxy
- [x] Etapa 4 — Deploy inicial em Minikube/Kind
- [x] Etapa 5 — `orchestrator` lendo métricas + WebSocket
- [x] Etapa 6 — `dashboard` consumindo WebSocket
- [x] Etapa 7 — HPA de verdade sob carga
- [x] Etapa 8 — RBAC + botão "matar pod"
- [x] Etapa 9 — NetworkPolicy completa
- [x] Etapa 10 — PgBouncer + graceful shutdown
- [x] Etapa 11 — Circuit breaker
- [x] Etapa 12 — CI (GitHub Actions)
- [ ] Etapa 13 — Polimento + vídeo de backup

---

## Etapa 1 — `api` + Postgres local + concorrência de estoque

**Por quê:** é o núcleo do projeto (§4.1, §4.3 do negocio.md). Sem isso funcionando, o resto não tem sentido.

**Entregáveis:**
- Projeto `api` (NestJS) rodando local com Postgres via docker-compose
- Migration da tabela `produtos` e `pedidos`
- `UPDATE` atômico de estoque (`WHERE estoque_disponivel >= :quantidade`)
- Os **dois** testes de integração de concorrência do §4.3: estoque (10 pedidos simultâneos, estoque=5) e idempotência (`ON CONFLICT`)

**Critério de pronto:** os dois testes de concorrência passam de forma consistente (rodar mais de uma vez), com banco de teste real (Testcontainers ou instância dedicada).

**Skill:** `system-architecture` (ler antes de criar a estrutura de módulos da `api`).

**Prompt sugerido:**
> Lendo a skill `system-architecture`, monta o projeto `api` em NestJS com Postgres local via docker-compose, migrations pra `produtos` e `pedidos`, o update atômico de estoque do §4.1 do negocio.md, e os dois testes de integração de concorrência do §4.3 (estoque e idempotência). TDD: escreve os testes antes.

---

## Etapa 2 — Idempotência completa em `POST /pedidos`

**Por quê:** o update atômico resolve overselling, mas não resolve pedido duplicado por retry de rede ou double-click (§4.2).

**Entregáveis:**
- Geração da `Idempotency-Key` uma vez por sessão de tentativa de compra (não por requisição)
- Botão de compra desabilitado no clique (frontend, mesmo que ainda rudimentar nessa etapa)
- Verificação atômica via `INSERT ... ON CONFLICT DO NOTHING` (nunca `SELECT` + `INSERT`)
- Testes cobrindo os dois refinamentos do §4.2

**Critério de pronto:** requisições concorrentes com a mesma chave nunca criam mais de um pedido; dois cliques rápidos do usuário não geram dois pedidos.

**Skill:** `system-architecture` (seção de idempotência já documentada lá).

**Prompt sugerido:**
> Implementa a idempotência completa de `POST /pedidos` conforme §4.2 do negocio.md e a skill `system-architecture`: chave gerada por sessão de tentativa, botão desabilitado no clique, verificação via `ON CONFLICT DO NOTHING`. TDD.

---

## Etapa 3 — `gateway` com auth real + proxy

**Por quê:** elimina o JWT fake e centraliza autenticação de verdade (§3).

**Entregáveis:**
- `POST /auth/login` no `gateway` (recebe só `nome`, sem senha)
- JWT assinado de verdade com `JWT_SECRET`
- `AuthGuard` validando assinatura e expiração
- Proxy L7 do `gateway` pra `api`, propagando `X-User-Id`/`X-User-Sub`

**Critério de pronto:** login retorna um JWT válido, requisições sem token são rejeitadas, requisições com token válido chegam na `api` com os headers internos corretos.

**Skill:** `system-architecture` (seção "Auth & Trust Boundary").

**Prompt sugerido:**
> Cria o serviço `gateway` em NestJS com `/auth/login` (JWT real assinado com `JWT_SECRET`), `AuthGuard`, e proxy L7 pra `api` propagando `X-User-Id`/`X-User-Sub`, conforme §3 do negocio.md e a skill `system-architecture`.

---

## Etapa 4 — Deploy inicial em Minikube/Kind

**Por quê:** tirar `api` + `gateway` + Postgres do docker-compose e rodar de verdade em Kubernetes.

**Entregáveis:**
- `k8s/namespace.yaml`, `k8s/secrets.example.yaml`
- Deployments + Services de `api`, `gateway`, `postgres`
- `Secret` real criado localmente (não versionado)
- RBAC básico (só leitura, ainda sem `delete`)
- HPA na `api`

**Critério de pronto:** os três serviços sobem no cluster local, login + compra funcionam via `kubectl port-forward` ou Ingress básico.

**Prompt sugerido:**
> Cria os manifests Kubernetes (`k8s/`) pra rodar `api`, `gateway` e `postgres` em Minikube: namespace, secrets (com template `secrets.example.yaml`), deployments, services, RBAC só-leitura e HPA na `api`. Segue a estrutura de repositório do §10 do negocio.md.

---

## Etapa 5 — `orchestrator` lendo métricas + WebSocket

**Por quê:** é a base do painel em tempo real, o maior diferencial do projeto (§8).

**Entregáveis:**
- Serviço `orchestrator` em NestJS usando `@kubernetes/client-node`
- Leitura de réplicas, CPU/memória (via `metrics-server`) e status de pods
- WebSocket gateway expondo esses dados

**Critério de pronto:** conectar num client WebSocket manual (ex: `wscat`) e ver os dados do cluster chegando em tempo real.

**Skill:** `system-architecture`.

**Prompt sugerido:**
> Cria o serviço `orchestrator` em NestJS: lê réplicas, CPU/memória e status de pods via `@kubernetes/client-node` + `metrics-server`, e expõe tudo isso por WebSocket, conforme §8 do negocio.md.

---

## Etapa 6 — `dashboard` consumindo WebSocket

**Entregáveis:**
- Projeto React (`dashboard/`) conectando no WebSocket do `orchestrator`
- Visualização de réplicas, CPU/memória, lista de pods com status ao vivo

**Critério de pronto:** rodar `kubectl scale` manualmente num Deployment e ver o dashboard refletir a mudança sem refresh.

**Prompt sugerido:**
> Cria o `dashboard` em React consumindo o WebSocket do `orchestrator`, mostrando réplicas, CPU/memória e lista de pods em tempo real, conforme §8 do negocio.md. Valida rodando `kubectl scale` manual.

---

## Etapa 7 — HPA de verdade sob carga

**Entregáveis:**
- Script k6 básico disparando carga contra `/pedidos`
- Botão "Disparar carga" no dashboard (ou aciona o k6 direto)
- Validação de que o HPA da `api` escala de verdade e o dashboard mostra isso ao vivo

**Critério de pronto:** disparar carga, ver o número de réplicas subir no dashboard sem intervenção manual.

**Prompt sugerido:**
> Cria um script k6 básico disparando carga contra `/pedidos`, mais o botão "Disparar carga" no dashboard, e valida que o HPA da `api` escala sob essa carga e o dashboard reflete isso ao vivo (§8 do negocio.md).

---

## Etapa 8 — RBAC + botão "matar pod"

**Por quê:** sem `delete` no RBAC, o botão quebra com 403 ao vivo (§5.1).

**Entregáveis:**
- `Role` do `orchestrator` com verbo `delete`
- Endpoint "matar pod" no `orchestrator` que filtra por `labelSelector: app=api` **no código** antes de deletar
- Botão funcional no dashboard, mostrando o pod sumir e ser recriado

**Critério de pronto:** clicar no botão mata um pod da `api` (nunca postgres/gateway) e o Kubernetes recria sozinho, visível no dashboard.

**Skill:** `system-architecture` (seção RBAC — risco residual já documentado ali, não precisa redescobrir).

**Prompt sugerido:**
> Implementa o RBAC do §5.1 do negocio.md (Role com `delete`) e o endpoint "matar pod" no `orchestrator`, filtrando por `labelSelector: app=api` no código (a skill `system-architecture` documenta esse risco residual). Conecta ao botão no dashboard.

---

## Etapa 9 — NetworkPolicy completa

**Por quê:** fecha o isolamento de rede interno por completo (§5.2 + §5.4) — sem isso, `ClusterIP` sozinho não isola nada.

**Entregáveis:**
- `NetworkPolicy` restringindo ingress de `api`/`orchestrator` só ao `gateway`
- `NetworkPolicy` restringindo ingress de `postgres`/`pgbouncer` só a `api`/`orchestrator`

**Critério de pronto:** subir um pod de debug no cluster e confirmar que ele **não** consegue chamar `api`, `orchestrator` ou `postgres` diretamente.

**Skill:** `system-architecture` (seção Kubernetes Security já tem os três YAMLs de referência).

**Prompt sugerido:**
> Cria as NetworkPolicies do §5.2 e §5.4 do negocio.md (também documentadas na skill `system-architecture`): `api`/`orchestrator` só aceitam o `gateway`, `postgres`/`pgbouncer` só aceitam `api`/`orchestrator`. Valida com um pod de debug no cluster.

---

## Etapa 10 — PgBouncer + graceful shutdown

**Entregáveis:**
- PgBouncer em modo `transaction pooling` entre serviços e Postgres
- Prepared statements desabilitados na conexão TypeORM (`prepare: false`) — ver §7.5
- `terminationGracePeriodSeconds: 30` + `preStop sleep 5` + `app.enableShutdownHooks()`

**Critério de pronto:** matar um pod da `api` no meio de uma compra não gera erro pro usuário; carga sustentada não produz erros intermitentes de conexão.

**Skill:** `system-architecture` (seção "Data Layer — PgBouncer", explica o porquê do `prepare: false`).

**Prompt sugerido:**
> Configura PgBouncer em transaction pooling e desabilita prepared statements na conexão TypeORM (§7.5 do negocio.md / skill `system-architecture`). Implementa graceful shutdown em `api`/`gateway`. Valida matando um pod durante uma compra em andamento.

---

## Etapa 11 — Circuit breaker

**Entregáveis:**
- Circuit breaker no `gateway` com os gatilhos do §9: abre em 5 falhas/10s, meio-aberto após 5s, fecha com 1 requisição de teste bem-sucedida
- `503` imediato com mensagem clara quando aberto
- Indicador de estado (fechado/aberto/meio-aberto) no dashboard

**Critério de pronto:** forçar falhas na `api` e ver o circuito abrir, responder `503` rápido, e o dashboard mostrar o estado mudando.

**Nota:** primeiro item a cortar se o tempo apertar (§11) — mas se entrar, entra com essas regras exatas.

**Prompt sugerido:**
> Implementa o circuit breaker no `gateway` com os gatilhos exatos do §9 do negocio.md, mais o indicador de estado no dashboard.

---

## Etapa 12 — CI (GitHub Actions)

**Entregáveis:**
- `.github/workflows/ci.yaml` rodando em push/PR: lint, testes unitários + integração (com Postgres de serviço), build das imagens Docker

**Critério de pronto:** um push que quebra o `WHERE estoque_disponivel >= :quantidade` ou o `ON CONFLICT` derruba o CI automaticamente.

**Prompt sugerido:**
> Cria o pipeline de CI (`.github/workflows/ci.yaml`) do §7.2 do negocio.md: lint, testes (com Postgres de serviço), build Docker — sem deploy automatizado.

---

## Etapa 13 — Polimento + vídeo de backup

**Entregáveis:**
- Revisão do checklist final do negocio.md (§13) — conferir que cada ✅/⚠️ está de fato como descrito
- Roteiro de apresentação ensaiado
- Vídeo de 3–4 min do fluxo completo gravado (backup contra risco de timing do HPA/WebSocket ao vivo)

**Critério de pronto:** vídeo gravado e testado, apresentação ensaiada cobrindo os trade-offs conscientes do §12.1 (RBAC, edge-terminated auth, HPA por CPU) caso alguém pergunte.

**Prompt sugerido:**
> Revisa o checklist do §13 do negocio.md item a item e aponta qualquer coisa que não bate com o que foi implementado até aqui.

---

## Usando `feature-tracking` no lugar deste roteiro

Este arquivo é o mapa geral, em pt-BR, pra você acompanhar. Se quiser um controle mais granular por feature (com critérios de aceite, casos de teste Given/When/Then e status por passo), peça pro Claude Code usar a skill `feature-tracking` pra criar o arquivo correspondente em `docs/features/` e atualizar `docs/features/BOARD.md` — ela é o board local que substitui GitHub Issues/Projects neste projeto.
