# Flash Sale Black Friday — MVP Kubernetes (v3, corrigida)

> Esta é a terceira versão do projeto. A v2 resolveu as 15 contradições/lacunas originais por mecanismo concreto (não só por afirmação). Esta v3 incorpora a segunda rodada de revisão, que identificou correções **parciais** (risco reduzido, não eliminado) e **riscos novos introduzidos pelas próprias correções**. Cada item abaixo está marcado como resolvido por completo ou como trade-off conscientemente aceito — nada fica implícito como "resolvido" quando na verdade é só mitigado.

**Objetivo:** simular uma flash sale de Black Friday com controle real de concorrência de estoque, rodando em Kubernetes, com autoscaling horizontal, load balancing em camadas, e um painel que mostra o cluster reagindo em tempo real.

---

## 1. Visão Geral e Roteiro de Demo

1. Usuário faz "login" (nome apenas) e recebe um JWT **de verdade**, assinado pelo `gateway`.
2. Usuário tenta comprar um produto com estoque limitado — múltiplas requisições concorrentes simulam o pico de Black Friday.
3. Painel do orchestrator mostra em tempo real: réplicas de cada serviço, CPU/memória, pods sendo criados pelo HPA.
4. Botão "Matar pod aleatório" remove um pod da `api` via API do Kubernetes — o painel mostra o pod sumir e o Kubernetes recriá-lo (self-healing), sem perder requisições em andamento.
5. Ao final, painel mostra: pedidos aceitos, pedidos rejeitados por falta de estoque, e **zero overselling e zero duplicação**, comprovado por teste automatizado (não só pela demo ao vivo).

**Backup da demo:** gravar um vídeo de 3–4 min do fluxo completo funcionando, para não depender 100% do ao vivo (risco de timing do HPA/WebSocket já era conhecido e mitigado).

---

## 2. Arquitetura

```
                        ┌──────────────┐
   Cliente/Browser ───▶ │   gateway    │  (HPA: 2–4 réplicas)
                        │ Auth+RateLim │
                        │  +Proxy L7   │
                        └──────┬───────┘
                     NetworkPolicy: só o gateway
                     pode chamar api/orchestrator
                  ┌────────────┼────────────┐
                  ▼                         ▼
          ┌───────────────┐        ┌────────────────┐
          │      api      │        │  orchestrator   │
          │ (HPA: 2–8)    │        │  (1–2 réplicas)  │
          │ regras de     │        │ lê métricas k8s  │
          │ negócio +     │        │ + WebSocket p/   │
          │ estoque       │        │ dashboard        │
          └───────┬───────┘        └────────┬─────────┘
                  │                          │
                  ▼                          ▼
          ┌───────────────────────────────────────┐
          │              Postgres                  │
          │  (via PgBouncer, pool controlado)       │
          └─────────────────▲───────────────────────┘
                             │
                NetworkPolicy: só api/orchestrator
                falam com Postgres/PgBouncer (§5.4)

          ┌───────────────┐         WebSocket
          │   dashboard    │ ◀──────────────────────── orchestrator
          │  (React + WS)  │ ◀──────────────────────── gateway (login via HTTP)
          └───────────────┘   (visualização dinâmica de tudo acima, ver seção 8)
```

Correção em relação à v1: **o `gateway` também tem HPA** (2–4 réplicas). Ele era o único ponto de entrada sem escalonamento, o que o tornava o gargalo real do sistema mesmo com a `api` escalando até 8 réplicas. Isso também dá mais um exemplo de "camadas que escalam de forma independente" para a apresentação.

**Limitação conhecida do HPA do gateway:** o `gateway` faz majoritariamente proxy HTTP + validação de JWT — trabalho leve de CPU, predominantemente I/O-bound esperando resposta da `api`. Escalar por percentual de CPU (métrica padrão do HPA) pode não disparar no momento certo: o gateway pode estar com fila de conexões grande e CPU baixa. Isso não invalida a correção — é melhor ter HPA impreciso do que não ter HPA nenhum —, mas é tratado aqui como limitação conhecida, não como solução perfeita. Evolução natural: métrica customizada de requisições em voo via Prometheus Adapter, junto com o restante do escopo de observabilidade avançada (seção 12).

Load balancing acontece em duas camadas, e isso é discutido explicitamente na apresentação:
- **L4 (Service/kube-proxy):** distribui requisições entre réplicas de um mesmo serviço.
- **L7 (gateway):** roteia por rota/regra de negócio antes de chegar no L4.

---

## 3. Autenticação (corrigida — sem JWT fake)

Antes: token "fake gerado no frontend" + `AuthGuard` que dava a entender autenticação real. Isso era contraditório e, se questionado, expunha que não havia segurança nenhuma.

**Agora, escolhida a opção que agrega mais valor ao portfólio (custo baixo, resolve a incoerência):**

- Endpoint `POST /auth/login` no `gateway`, recebendo só um `nome` (sem senha — deixado explícito como simplificação de MVP, não como falha escondida).
- O `gateway` assina um JWT real com uma chave própria (`JWT_SECRET`, guardada em `Secret` do Kubernetes — ver seção 6).
- O `AuthGuard` valida assinatura e expiração de verdade.
- O JWT validado é propagado via header interno (`X-User-Id`, `X-User-Sub`) para `api`/`orchestrator`, que **confiam nesse header só porque a NetworkPolicy garante que ninguém além do gateway consegue chamá-los diretamente** (ver seção 5).

Isso custa pouco a mais que o MVP original e elimina a maior incoerência apontada: agora "autenticação centralizada" é uma frase verdadeira, não uma simulação.

**Trade-off aceito conscientemente (não é uma lacuna escondida):** `api` e `orchestrator` não re-verificam o JWT — eles confiam no header `X-User-Id`/`X-User-Sub` propagado pelo `gateway`. A única barreira contra um pod forjar esse header e se passar por outro usuário é a `NetworkPolicy` (seção 5.2): a segurança interna depende inteiramente dela não ser violada, sem defesa em profundidade nessa borda. Esse padrão ("edge-terminated auth") é comum em arquiteturas reais e é aceitável para um MVP, mas é declarado aqui como decisão consciente, não como algo "resolvido" sem ressalvas. Evolução natural: mTLS entre serviços, ou um segredo compartilhado para re-assinar o header internamente antes de repassá-lo — fora do escopo do MVP (seção 12), mas bom conteúdo de discussão de trade-offs na apresentação.

---

## 4. Regra de Negócio: Concorrência de Estoque

Núcleo do projeto — mantido e reforçado.

### 4.1 Update atômico (mantido)
```sql
UPDATE produtos
SET estoque_disponivel = estoque_disponivel - :quantidade
WHERE id = :produtoId AND estoque_disponivel >= :quantidade;
```
Se `rowCount = 0`, pedido é rejeitado por falta de estoque. Resolve overselling.

### 4.2 Idempotência em `POST /pedidos` (lacuna corrigida, com dois refinamentos)
Sob timeout de rede — bem provável no cenário simulado de pico — o frontend pode reenviar a mesma tentativa de compra. O `UPDATE` atômico resolve overselling, mas **não** resolve pedido duplicado do mesmo clique.

**Mecanismo base:** cliente envia um `Idempotency-Key` (UUID). A `api` guarda esse UUID com constraint `UNIQUE` numa tabela `pedidos`. Se a mesma chave chegar de novo (retry), a `api` retorna o resultado do pedido já processado, sem tentar debitar estoque de novo.

**Refinamento 1 — quando a chave é gerada (cobre retry de rede *e* double-click de UI):** a chave não é gerada a cada requisição, e sim uma vez por "sessão de tentativa de compra" — criada quando a tela de compra carrega, reaproveitada em qualquer retry automático dessa tentativa. Além disso, o botão de compra é desabilitado imediatamente no clique, no frontend. Sem essas duas coisas juntas, dois cliques rápidos do próprio usuário gerariam dois pedidos legítimos e distintos — o mecanismo de chave sozinho só protege contra retry automático de rede, não contra double-submit de UI, e seria irônico expor exatamente esse bug no cenário de disparos rápidos que a demo simula.

**Refinamento 2 — a verificação da chave precisa ser atômica:** se a checagem "essa chave já existe?" for um `SELECT` seguido de `INSERT` separado, duas requisições concorrentes com a **mesma** chave (ex.: retry disparado dos dois lados de uma race de rede) podem ambas passar pelo `SELECT` antes de qualquer `INSERT` existir — reintroduzindo, na tabela de idempotência, exatamente a race condition que o `UPDATE` atômico da seção 4.1 foi desenhado para evitar no estoque. Por isso a verificação usa:
```sql
INSERT INTO pedidos (idempotency_key, produto_id, quantidade, status, ...)
VALUES (:key, :produtoId, :quantidade, 'processando', ...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```
Se não retornar linha, é porque a chave já existe — a `api` busca o pedido existente e retorna o resultado dele, sem tentar debitar estoque de novo. Nunca `SELECT` seguido de `INSERT` em passos separados.

### 4.3 Teste automatizado de concorrência (lacuna mais importante corrigida)
Sem isso, a garantia de "sem overselling" era só uma alegação no README. Agora, dois testes de integração distintos (Jest + Supertest, banco de teste real via Testcontainers ou instância dedicada):

1. **Concorrência de estoque:** dispara **N requisições concorrentes** (`Promise.all`) contra um produto com estoque = 5 e quantidade = 10 pedidos simultâneos de 1 unidade, cada um com `Idempotency-Key` distinta. Assert: exatamente 5 pedidos aceitos, 5 rejeitados, `estoque_disponivel = 0` ao final.
2. **Concorrência de idempotência (novo, cobre o Refinamento 2):** dispara **M requisições concorrentes com a mesma `Idempotency-Key`** contra o mesmo produto. Assert: exatamente **um** pedido é criado no banco, e todas as respostas retornam o mesmo `pedidoId` — prova de que a checagem `ON CONFLICT` é de fato atômica sob concorrência real, não só em teoria.

Ambos rodam no CI a cada push (seção 7) — se alguém remover o `WHERE estoque_disponivel >= :quantidade` ou trocar o `ON CONFLICT` por um `SELECT`+`INSERT` numa refatoração futura, o CI quebra imediatamente, em vez de descobrir isso ao vivo.

### 4.4 Endpoint de reset (lacuna menor corrigida)
`POST /admin/reset` (protegido, só para demo) repõe estoque e limpa pedidos, permitindo rodar a simulação várias vezes sem precisar reiniciar o banco manualmente.

---

## 5. Segurança de Rede e RBAC (contradições corrigidas)

### 5.1 RBAC — agora permite o que a demo exige
Antes: `rbac.yaml` só com `get/list/watch`, mas o botão "matar pod" exigia `delete`. Como especificado, isso quebraria com `403 Forbidden` ao vivo.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: blackfriday
  name: orchestrator-role
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch", "delete"]
    # Escopo adicional recomendado: restringir via label selector no client
    # (o orchestrator só deve deletar pods com label app=api,
    # nunca postgres ou gateway — isso é aplicado no código, não no RBAC,
    # já que RBAC do k8s não filtra por label de forma nativa)
```
No código do `orchestrator`, o endpoint de "matar pod" lista pods com `labelSelector: app=api` antes de escolher um aleatoriamente para deletar — evitando que um bug derrube o Postgres ou o gateway por engano.

**Risco residual, declarado explicitamente (não é "resolvido" sem ressalva):** o `Role` acima concede `delete` sobre **qualquer** pod do namespace `blackfriday` — a restrição a `app=api` existe só no código do `orchestrator`, porque RBAC do Kubernetes não filtra por label nativamente. Um bug no filtro do client (ou uma futura chamada manual à mesma credencial) ainda teria permissão, em nível de infraestrutura, para deletar o Postgres ou o gateway. Duas opções, nenhuma implementada por padrão no MVP para não inflar o escopo, mas documentadas como próximo passo natural:
- **(a) Namespace dedicado** só para os pods da `api`, com o `Role` do orchestrator escopado a esse namespace — restringe de verdade, em nível de infraestrutura, não só de aplicação.
- **(b) Aceitar o risco como está**, documentado aqui como "mitigado só em nível de aplicação" — suficiente para um MVP de portfólio, desde que declarado, não escondido atrás da palavra "resolvido" (ver checklist atualizado na seção 13).

### 5.2 NetworkPolicy — api/orchestrator (lacuna de segurança corrigida)
Antes: a alegação de que `api`/`orchestrator` "não são expostos" (por não terem Ingress) dava uma falsa sensação de isolamento — `ClusterIP` só restringe acesso *externo*; qualquer pod dentro do cluster ainda conseguia chamá-los direto pelo DNS interno, contornando o gateway (e a autenticação) completamente.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow-only-gateway
  namespace: blackfriday
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: gateway
```
(Mesma política replicada para `orchestrator`.) Agora a frase correta na apresentação é: "reduzimos a superfície de ataque externa **e** interna — só o gateway fala com api/orchestrator, reforçado por NetworkPolicy, não só pela ausência de Ingress."

### 5.3 Rate limiting — honesto sobre a limitação
Antes: "rate limit por usuário" dava a entender proteção robusta, mas com identidade fraca isso seria contornável. Agora, com JWT real (seção 3), rate limit por usuário autenticado faz sentido de fato. Mantemos **também** rate limit por IP como camada adicional, documentado explicitamente como defesa em profundidade (usuário autenticado com abuso + fallback por IP para requisições anônimas/pré-login).

### 5.4 NetworkPolicy — Postgres/PgBouncer (lacuna nova, fecha o isolamento por completo)
A v2 isolava `api`/`orchestrator` (seção 5.2), mas deixava o Postgres/PgBouncer acessível a qualquer pod do namespace — nenhuma `NetworkPolicy` os cobria. Como o argumento usado para justificar 5.2 foi "isolamento de rede interno", deixar o banco de fora quebrava essa promessa pela metade: um pod comprometido não falava mais direto com `api`/`orchestrator`, mas ainda podia tentar falar direto com o banco (limitado só pela senha do Postgres — uma defesa mais fraca que isolamento de rede).

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-allow-only-backend
  namespace: blackfriday
spec:
  podSelector:
    matchLabels:
      app: pgbouncer
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api
        - podSelector:
            matchLabels:
              app: orchestrator
```
(O Postgres em si só recebe conexão do `pgbouncer`, via `NetworkPolicy` equivalente com `podSelector: app: postgres` e `from: app: pgbouncer`.) Com isso o isolamento de rede fica completo — `api`/`orchestrator` só falam com quem devem, e o banco só fala com `api`/`orchestrator` via `pgbouncer`.

---

## 6. Segredos (lacuna corrigida)

Nada de senha de Postgres ou `JWT_SECRET` em texto puro nos manifests.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: blackfriday-secrets
  namespace: blackfriday
type: Opaque
stringData:
  POSTGRES_PASSWORD: "<gerado, não versionado>"
  JWT_SECRET: "<gerado, não versionado>"
```
Deployments referenciam via `envFrom.secretRef`. Um `secrets.example.yaml` (sem valores reais) fica versionado no repo como template; o real é criado localmente ou via `kubectl create secret` no roteiro de setup, e `.gitignore` cobre o arquivo real.

---

## 7. Qualidade de Engenharia (lacunas mais graves corrigidas)

### 7.1 Testes automatizados
- **Unitários:** regras de negócio isoladas (cálculo de estoque, validação de pedido) em `api`.
- **Integração:** o teste de concorrência da seção 4.3 é o mais importante do projeto.
- **E2E leve:** fluxo login → compra → verificação de estoque, via Supertest contra o `gateway`.
- **Carga (k6):** script que dispara requisições concorrentes contra `/pedidos` com `threshold` que **falha a execução** se detectar overselling ou taxa de erro acima do esperado. Isso transforma "testei manualmente e funcionou" em prova automatizada.

### 7.2 CI/CD (GitHub Actions)
Pipeline mínimo, mas real:
```
on: [push, pull_request]
jobs:
  test:
    - lint (eslint) nos 3 serviços NestJS
    - testes unitários + integração (com Postgres de serviço no CI)
    - build das imagens Docker (sem push, só valida que builda)
  # deploy automatizado no cluster fica fora do MVP (cluster é local/efêmero),
  # mas o pipeline de build+test já é o sinal de maturidade que faltava
```

### 7.3 Migrations
TypeORM migrations versionadas no repo (`migrations/*.ts`), rodadas via `npm run migration:run` num `initContainer` do Deployment da `api` (ou job separado no roteiro de setup) — nunca `synchronize: true` em ambiente que simula produção.

### 7.4 Graceful shutdown
- `terminationGracePeriodSeconds: 30` nos Deployments de `api`/`gateway`.
- `preStop` hook com `sleep 5` (dá tempo do endpoint sair do Service antes do SIGTERM).
- NestJS captura `SIGTERM` (`app.enableShutdownHooks()`), termina requisições em andamento e fecha a conexão com o Postgres antes de encerrar.
- Isso é testável na própria demo: matar um pod no meio de uma compra não deve gerar erro para o usuário, mostrando graceful shutdown funcionando ao vivo (em vez de expor o bug que a v1 corria o risco de mostrar).

### 7.5 Connection pooling
Com HPA permitindo até 8 réplicas de `api` + `orchestrator`, pools default do TypeORM (10 conexões cada) podiam facilmente estourar `max_connections` do Postgres (padrão 100). Correção:
- **PgBouncer** entre os serviços e o Postgres, em modo `transaction pooling`.
- Pool por pod reduzido conscientemente (`max: 5`) e documentado o cálculo: `8 réplicas × 5 = 40` conexões diretas no PgBouncer, que multiplexa para um pool bem menor no Postgres real.

**Ajuste de configuração necessário, não óbvio (risco identificado na revisão):** modo `transaction pooling` não é compatível, por padrão, com **prepared statements** em vários drivers Postgres — incluindo o driver `pg` usado pelo TypeORM em configurações comuns —, porque cada conexão do pool pode ser reaproveitada entre transações diferentes, e prepared statements ficam presos a uma conexão específica. Sem esse ajuste, erros intermitentes e difíceis de depurar apareceriam justamente sob a carga que a demo quer provocar. Correção: desabilitar prepared statements na configuração da conexão TypeORM (opção equivalente a `prepare: false` / desabilitar `statement caching` no driver) quando atrás do PgBouncer em modo transaction. Documentado aqui explicitamente para não ser redescoberto como bug no dia da demo.

### 7.6 Logs estruturados e correlação
- Logger estruturado (JSON) em todos os serviços.
- `correlationId` gerado no `gateway` (ou recebido via header `X-Correlation-Id`) e propagado até `api`/`orchestrator`, aparecendo em todo log relacionado à mesma requisição — essencial para depurar a demo ao vivo se algo falhar.
- OpenTelemetry fica como **item opcional avançado** (ver seção 9), não obrigatório para o MVP.

### 7.7 Timeout e retry configuráveis
`gateway` define timeout explícito (ex.: 3s) para chamadas a `api`/`orchestrator`, com 1 retry automático em falhas transitórias (não em timeouts de negócio, como estoque insuficiente). Isso é o gatilho que alimenta o circuit breaker (seção 9).

---

## 8. Frontend / Dashboard (visualização dinâmica do cluster)

Este é o diferencial mais forte do projeto e é mantido/reforçado como prioridade.

**Stack:** React + WebSocket (conectado ao `orchestrator`).

**O que mostra em tempo real:**
- Número de réplicas atuais de cada Deployment (`gateway`, `api`, `orchestrator`) e o alvo do HPA.
- CPU/memória por pod (via `metrics-server`, lido pelo `orchestrator` e empurrado por WebSocket).
- Lista de pods vivos, com status (`Running`, `Pending`, `Terminating`) atualizando ao vivo — inclusive durante o scale-up disparado pela carga simulada.
- Gráfico de estoque disponível caindo em tempo real conforme pedidos concorrentes são processados.
- Contador de pedidos aceitos vs. rejeitados, atualizado por evento (não por polling).
- Botão "Matar pod aleatório" (agora funcional de verdade, seção 5.1) e visualização do pod sumindo e sendo recriado pelo Kubernetes.
- Botão "Disparar carga" que aciona o script k6 (ou dispara N requisições do próprio frontend) para simular o pico de Black Friday e ver o HPA reagir na tela.
- Indicador de estado do circuit breaker (fechado/aberto/meio-aberto) do `gateway`, já que ele foi definido com gatilhos claros (seção 9).

**Por que isso importa para o portfólio:** poucos projetos mostram o cluster reagindo *ao vivo* a uma carga real, com WebSocket lendo `@kubernetes/client-node` de verdade — isso é mais forte do que qualquer print de terminal com `kubectl get pods -w`.

---

## 9. Circuit Breaker — agora com fronteiras definidas

Antes: tratado como "opcional, mas rico pra discutir", sem definir gatilho de fechamento nem o que o usuário via nesse meio-tempo — risco de comportamento imprevisível ao vivo.

**Definição explícita:**
- **Abre** quando: 5 falhas consecutivas (timeout ou erro 5xx) da `api` em uma janela de 10s.
- **Meio-aberto** após: 5s, deixando 1 requisição de teste passar.
- **Fecha** quando: essa requisição de teste tem sucesso.
- **O que o usuário vê com o circuito aberto:** resposta imediata `503` com mensagem clara ("Alta demanda no momento, tente novamente em instantes") em vez de esperar o timeout completo — e o dashboard mostra o estado do circuito (seção 8), então isso vira parte da narrativa da demo em vez de um comportamento misterioso.

Se o tempo apertar, este item pode ser cortado do escopo — mas, se entrar, entra com essas regras definidas, não como promessa vaga.

---

## 10. Estrutura de Repositório (sincronizada com o restante do documento)

```
blackfriday-k8s/
├── services/
│   ├── gateway/           # NestJS — auth (JWT real), rate limit, proxy L7, circuit breaker
│   ├── api/                # NestJS — regras de negócio, estoque, pedidos, idempotência
│   └── orchestrator/       # NestJS — leitura do cluster, WebSocket, endpoint de matar pod
├── dashboard/               # React — painel em tempo real (seção 8)
├── k8s/
│   ├── namespace.yaml
│   ├── secrets.example.yaml
│   ├── rbac.yaml            # com verbo delete (seção 5.1)
│   ├── networkpolicy-api.yaml
│   ├── networkpolicy-orchestrator.yaml
│   ├── networkpolicy-postgres.yaml    # inclui pgbouncer (seção 5.4)
│   ├── deployment-gateway.yaml    # agora com HPA
│   ├── deployment-api.yaml
│   ├── deployment-orchestrator.yaml
│   ├── deployment-dashboard.yaml
│   ├── deployment-postgres.yaml
│   ├── deployment-pgbouncer.yaml
│   ├── service-gateway.yaml
│   ├── service-api.yaml
│   ├── service-orchestrator.yaml
│   ├── service-dashboard.yaml
│   ├── service-postgres.yaml
│   ├── hpa-gateway.yaml
│   ├── hpa-api.yaml
│   └── ingress.yaml         # só gateway e dashboard expostos
├── tests/
│   ├── unit/
│   ├── integration/          # inclui o teste de concorrência (seção 4.3)
│   └── load/                 # script k6 com threshold (seção 7.1)
├── .github/workflows/ci.yaml
└── README.md
```

---

## 11. Roteiro de Desenvolvimento (incremental, validando a cada passo)

1. `api` + Postgres local (docker-compose), com migrations e o `UPDATE` atômico + os **dois** testes de integração de concorrência (estoque e idempotência via `ON CONFLICT`, seção 4.3) passando **antes de qualquer outra coisa**. Este é o coração do projeto — se não sair aqui, nada mais importa.
2. Idempotência em `POST /pedidos` com geração de chave por sessão de tentativa + botão desabilitado no clique (seção 4.2, Refinamento 1) + testes.
3. `gateway` com `/auth/login` real (JWT assinado) + proxy para `api`.
4. Deploy de `api` + `gateway` + Postgres em Minikube/Kind, com `Secret`, RBAC básico (só leitura ainda) e HPA na `api`.
5. `orchestrator` lendo métricas do cluster via `@kubernetes/client-node`, expondo WebSocket.
6. `dashboard` consumindo o WebSocket — validar visualização em tempo real com carga manual (`kubectl scale` manual antes de confiar no HPA).
7. HPA de verdade disparando sob carga simulada (k6 básico) — validar que o dashboard reflete isso ao vivo.
8. RBAC com `delete` escopado por label + endpoint "matar pod" no `orchestrator` + botão no dashboard.
9. NetworkPolicy de `api`/`orchestrator` (5.2) **e** de Postgres/PgBouncer (5.4) — validar que chamadas diretas de fora do `gateway`/`api`/`orchestrator` passam a falhar (teste manual com um pod de debug no cluster).
10. PgBouncer com prepared statements desabilitados (seção 7.5) + graceful shutdown — validar matando pod durante uma compra em andamento, sem erro para o usuário e sem erro intermitente de conexão sob carga.
11. Circuit breaker com as regras da seção 9, refletido no dashboard.
12. CI (GitHub Actions) com lint + testes + build.
13. Polimento da apresentação + gravação do vídeo de backup da demo.

**Escopo de corte, se o tempo apertar (nesta ordem):** circuit breaker → OpenTelemetry (nunca esteve no MVP) → Helm chart → ambiente em cloud gerenciada. **Nunca cortar:** teste de concorrência, idempotência, RBAC correto, NetworkPolicy, secrets — são baratos e resolvem contradições que quebrariam a demo ou uma pergunta técnica básica.

---

## 12. O que fica fora do MVP (explicitamente, para não prometer o que não será mostrado)

- OpenTelemetry / tracing distribuído completo — mencionar como "próximo passo natural", não implementar.
- Ambiente em cloud gerenciada (EKS/GKE) — documentar como facilmente portável (nada aqui é Minikube-specific além do `metrics-server`), mas rodar só local no MVP.
- Helm/Kustomize — YAML puro é aceitável para 6 Deployments; mencionar Helm como evolução natural na seção de "próximos passos" da apresentação, sem fingir que já existe.
- Cancelamento de pedido / reposição manual de estoque fora do `/admin/reset` — fica como ideia de extensão futura.

### 12.1 Trade-offs conscientemente aceitos (diferente de "fora do MVP" — aqui, a decisão *é* implementada, com uma limitação declarada)
- **RBAC do orchestrator permite `delete` em qualquer pod do namespace; a restrição a `app=api` é só de aplicação** (seção 5.1). Mitigação em nível de infraestrutura (namespace dedicado) fica como evolução, não como bug escondido.
- **`api`/`orchestrator` confiam no header interno propagado pelo gateway sem re-verificação criptográfica própria; a única defesa é a `NetworkPolicy`** (seção 3). Padrão comum ("edge-terminated auth"), mas sem defesa em profundidade nessa borda — mTLS ou re-assinatura interna seriam o próximo passo.
- **HPA do gateway escala por CPU, métrica imprecisa para uma carga majoritariamente I/O-bound** (seção 2). Aceito porque HPA impreciso ainda é melhor que HPA ausente; métrica customizada de requisições em voo é o refinamento natural.

Esses três itens aparecem nas seções indicadas como decisões implementadas e conscientes — se um avaliador perguntar sobre eles, a resposta é "sim, sabemos, e aqui está o trade-off", não uma descoberta ao vivo.

---

## 13. Checklist Final (v1 → v2 → v3, com status honesto sobre cada correção)

**Legenda:** ✅ Resolvido por completo (mecanismo fecha o problema) · ⚠️ Mitigado, com trade-off declarado (seção 12.1) · 🆕 Risco novo, introduzido pela própria correção, e já endereçado nesta v3

| Problema | Onde | Status |
|---|---|---|
| RBAC só leitura vs. botão matar pod | §5.1 | ⚠️ Funcionalidade resolvida; restrição por label é só de aplicação, não de RBAC do cluster |
| JWT fake vs. auth centralizada | §3 | ✅ |
| Confiança de `api`/`orchestrator` no header interno sem verificação própria | §3, §12.1 | ⚠️ Depende inteiramente da NetworkPolicy não ser violada |
| Rate limit por usuário sem identidade confiável | §5.3 | ✅ |
| Gateway sem HPA sendo o gargalo real | §2 | ✅ (com ressalva de métrica — ver abaixo) |
| HPA do gateway por CPU não reflete carga I/O-bound | §2, §12.1 | ⚠️ Aceito para o MVP; métrica customizada é evolução |
| Falsa sensação de isolamento sem NetworkPolicy (api/orchestrator) | §5.2 | ✅ |
| Isolamento de rede não cobria Postgres/PgBouncer | §5.4 | ✅ |
| Ausência de testes automatizados | §7.1 | ✅ |
| Ausência de CI/CD | §7.2 | ✅ |
| Sem gestão de secrets | §6 | ✅ |
| Sem idempotência em `/pedidos` | §4.2 | ✅ |
| Idempotência não cobria double-click de UI | §4.2 (Refinamento 1) | 🆕 resolvido — chave por sessão + botão desabilitado no clique |
| Verificação de idempotência não era atômica (`SELECT`+`INSERT`) | §4.2 (Refinamento 2), §4.3 | 🆕 resolvido — `ON CONFLICT DO NOTHING` + teste de concorrência dedicado |
| Sem graceful shutdown | §7.4 | ✅ |
| Sem connection pooling dimensionado | §7.5 | ✅ |
| PgBouncer transaction mode incompatível com prepared statements do TypeORM | §7.5 | 🆕 resolvido — prepared statements desabilitados |
| Sem migrations | §7.3 | ✅ |
| Sem correlationId nos logs | §7.6 | ✅ |
| Circuit breaker sem gatilhos definidos | §9 | ✅ |
| Estrutura de repo desatualizada (seção 4 vs 5) | §10 | ✅ |
| Diagrama sem conexão dashboard↔gateway/orchestrator | §2 | ✅ |

Os itens ⚠️ não bloqueiam a demo nem representam contradição — são trade-offs de MVP declarados de propósito, para que uma pergunta técnica sobre eles tenha resposta pronta ("sim, sabemos, e o próximo passo seria X") em vez de expor uma lacuna não percebida.