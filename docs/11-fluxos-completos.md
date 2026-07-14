# 11. Fluxos completos, passo a passo

[← Voltar ao índice](README.md)

## 11.1 Login

```mermaid
sequenceDiagram
    participant B as Browser (dashboard)
    participant GW as gateway

    B->>GW: POST /auth/login {"nome": "..."}
    GW->>GW: LoginDto valida nome não vazio
    GW->>GW: AuthController (@Public, sem AuthGuard)
    GW->>GW: AuthService monta {sub: nome, id: randomUUID()}\ne assina com JWT_SECRET
    GW-->>B: 201 {"accessToken": "<jwt>"}
```

## 11.2 Compra (caminho feliz, estoque disponível)

```mermaid
sequenceDiagram
    participant B as Browser
    participant GW as gateway
    participant API as api
    participant DB as Postgres

    B->>GW: POST /pedidos\nAuthorization: Bearer jwt\nIdempotency-Key: uuid
    GW->>GW: AuthGuard valida JWT
    GW->>GW: circuit breaker fechado — deixa passar
    GW->>GW: remove Authorization\ninjeta X-User-Id / X-User-Sub
    GW->>API: POST /pedidos (proxied)
    API->>API: exige Idempotency-Key
    API->>DB: BEGIN
    API->>DB: INSERT pedidos ON CONFLICT DO NOTHING (chave nova → insere)
    API->>DB: UPDATE produtos SET estoque -= qtd WHERE estoque >= qtd (sucesso)
    API->>DB: UPDATE pedidos SET status = confirmado
    API->>DB: COMMIT
    API-->>GW: 201 pedido confirmado
    GW->>GW: registra sucesso no circuit breaker
    GW-->>B: 201 (sem Authorization/content-length originais)
```

## 11.3 Compra (estoque insuficiente)

Idêntico ao fluxo acima até o `UPDATE` de estoque, mas ele afeta zero linhas (`estoque_disponivel < quantidade` no momento exato) — o pedido é marcado `rejeitado`, a transação ainda faz commit normalmente (rejeitar um pedido não é um erro, é um desfecho de negócio válido), e a `api` responde `409`.

## 11.4 Retry de rede com a mesma `Idempotency-Key`

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as api
    participant DB as Postgres

    Note over B: timeout de rede na 1ª tentativa —\nBrowser reenvia com a MESMA chave\n(mesma PurchaseAttemptSession)
    B->>API: POST /pedidos (Idempotency-Key repetida)
    API->>DB: INSERT ... ON CONFLICT DO NOTHING\n(0 linhas — chave já existe)
    API->>DB: SELECT pedido existente
    API-->>B: retorna pedido já resolvido\n(sem debitar estoque de novo)
```

## 11.5 Duplo clique do usuário no botão de compra

O `BuyButtonGuard` (ver [documento 5](05-dashboard.md#55-purchase--proteção-contra-duplo-clique)) marca `disabled = true` no primeiro clique, antes mesmo da primeira requisição terminar — o segundo clique é ignorado no próprio frontend e nunca chega a gerar uma segunda chamada de rede.

## 11.6 Matar um pod da `api` durante uma compra em andamento

```mermaid
sequenceDiagram
    participant B as Browser
    participant ORCH as orchestrator
    participant K8s as Kubernetes
    participant Pod as pod api (antigo)
    participant Dash as dashboard (WebSocket)

    B->>ORCH: POST /pods/kill
    ORCH->>K8s: lista pods labelSelector=app=api
    ORCH->>ORCH: sorteia 1 pod
    ORCH->>K8s: deleteNamespacedPod
    K8s->>Pod: marca Terminating, remove dos endpoints
    K8s->>Pod: preStop (sleep 5)
    Note over Pod: requisições em voo continuam sendo servidas
    K8s->>Pod: SIGTERM
    Pod->>Pod: NestJS termina requisições, fecha conexão DB
    K8s->>K8s: cria novo pod (self-healing)
    ORCH->>K8s: próximo poll (até 2s depois)
    ORCH->>Dash: broadcast snapshot atualizado
    Dash->>Dash: anima pod antigo sumindo,\nnovo pod aparecendo
```

Como o Deployment `api` pede 2+ réplicas (e o HPA pode ter mais), o `Service` `api` continua tendo pelo menos uma réplica saudável recebendo tráfego durante todo o processo — o usuário, na prática, não vê erro nenhum. Detalhes de graceful shutdown: [documento 7, seção 7.6](07-kubernetes.md#76-graceful-shutdown--como-as-peças-se-encaixam).

## 11.7 Circuit breaker abrindo sob falhas da `api`

```mermaid
sequenceDiagram
    participant API as api (com falhas)
    participant GW as gateway
    participant B as Browser
    participant Panel as CircuitBreakerPanel

    loop 5 falhas em 10s
        B->>GW: POST /pedidos
        GW->>API: proxy
        API-->>GW: 5xx ou timeout
        GW->>GW: registrarFalha()
    end
    GW->>GW: abre o circuito
    B->>GW: POST /pedidos (nova tentativa)
    GW-->>B: 503 imediato — "Alta demanda no momento..."\n(api nem é chamada)
    Panel->>GW: GET /circuit-breaker/status (poll 2s)
    GW-->>Panel: {"state": "aberto"}

    Note over GW: após 5s → meio-aberto
    B->>GW: POST /pedidos (requisição de teste)
    GW->>API: proxy (única passagem permitida)
    API-->>GW: 200/201 (sucesso)
    GW->>GW: fecha o circuito
    GW-->>B: resposta normal
```

---

[← Anterior: CI/CD e Docker](10-cicd-e-docker.md) · [Voltar ao índice](README.md) · [Próximo: Trade-offs e como rodar →](12-trade-offs-e-como-rodar.md)
