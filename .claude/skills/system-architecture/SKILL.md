---
name: system-architecture
description: Reference for the Flash Sale Black Friday backend architecture. Use whenever creating modules, services, repositories, k8s manifests, or touching stock/order logic — defines layers, mandatory patterns, and the concurrency guarantees the whole project depends on.
---

# Flash Sale Black Friday — System Architecture

## Overview

Three NestJS services plus a React dashboard, deployed to Kubernetes:

- **gateway** — auth (real JWT), rate limiting, L7 proxy, circuit breaker. HPA 2–4 replicas.
- **api** — business rules, stock, orders, idempotency. HPA 2–8 replicas.
- **orchestrator** — reads cluster metrics via `@kubernetes/client-node`, exposes WebSocket, hosts the "kill pod" endpoint. 1–2 replicas.
- **dashboard** — React, consumes the orchestrator's WebSocket in real time.

Load balancing happens in two layers: **L4** (Service/kube-proxy) distributes across replicas of one service; **L7** (`gateway`) routes by route/business rule before traffic reaches L4. Full spec and rationale: [negocio.md](../../docs/negocio.md).

---

## Module Structure — `api`

Same layered pattern for every feature module:

```
src/
  <module>/
    <module>.module.ts       # NestJS module — imports, providers, exports
    <module>.controller.ts   # HTTP layer — receives request, calls application
    <module>.application.ts  # Thin orchestration layer, calls services
    <module>.service.ts      # Business logic
    <module>.domain.ts       # Repository — extends RepositoryAdapter<Entity>
    <module>.mapper.ts       # Static DTO <-> Entity <-> ResponseDto mapping
    dto/
      create-<module>.dto.ts
      update-<module>.dto.ts
      <module>-response.dto.ts
    entities/
      <module>.entity.ts
```

**Flow:** `Controller → Application → Service → Domain (Repository) → PostgreSQL`

- **Controller** — validates the HTTP request, applies `@Public()` or auth decorators, calls only `Application`, no business logic.
- **Application** — thin orchestration between controller and service(s); never touches the database directly.
- **Service** — all business logic; calls `Domain` for persistence; wraps multi-table operations in `@Transactional()`.
- **Domain** — extends `RepositoryAdapter<Entity>`; adds only feature-specific queries.
- **Mapper** — static class, pure functions, DTO → Entity and Entity → ResponseDto. Never contains business logic.

`gateway` and `orchestrator` are thinner and don't need the full five-layer split — `gateway` is mostly auth/proxy/rate-limit/circuit-breaker middleware, `orchestrator` is mostly a Kubernetes client wrapper + WebSocket gateway. Keep controller/service separation there, skip domain/mapper where there's no persistence.

---

## Core Business Rule — Stock Concurrency

This is the heart of the project. Nothing else matters if this breaks under load.

### Atomic stock decrement

```sql
UPDATE produtos
SET estoque_disponivel = estoque_disponivel - :quantidade
WHERE id = :produtoId AND estoque_disponivel >= :quantidade;
```

If `rowCount = 0`, the order is rejected for insufficient stock. This single atomic statement is what prevents overselling — never read-then-write stock in separate steps.

### Idempotency on `POST /pedidos`

Two rules, both required:

1. **Key lifetime** — the `Idempotency-Key` (UUID) is generated once per *purchase-attempt session* (when the purchase screen loads), not per HTTP request, and reused across any automatic retry of that attempt. The buy button is also disabled immediately on click, client-side. Without both, two fast clicks from the same user create two legitimate-looking distinct orders — the key alone only guards against network retries, not UI double-submit.
2. **Atomic check** — never `SELECT` then `INSERT` to check whether a key was already used; that reintroduces a race between concurrent requests carrying the same key. Always:

```sql
INSERT INTO pedidos (idempotency_key, produto_id, quantidade, status, ...)
VALUES (:key, :produtoId, :quantidade, 'processando', ...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```

If no row comes back, the key already exists — fetch and return the existing order instead of debiting stock again.

### Mandatory tests

Every change touching stock or `/pedidos` must keep two integration tests green (real database, Jest + Supertest):

1. **Stock concurrency** — N concurrent requests, stock = 5, 10 simultaneous orders of 1 unit each, distinct `Idempotency-Key` per request. Assert exactly 5 accepted, 5 rejected, final stock = 0.
2. **Idempotency concurrency** — M concurrent requests with the *same* `Idempotency-Key`. Assert exactly one order is created and every response returns the same order id.

Both run in CI on every push. If someone removes the `WHERE estoque_disponivel >= :quantidade` guard or swaps `ON CONFLICT` for `SELECT`+`INSERT`, CI must fail immediately.

---

## Auth & Trust Boundary

- `POST /auth/login` on `gateway` takes only a `nome` (no password — explicit MVP simplification). `gateway` signs a real JWT with `JWT_SECRET` (Kubernetes `Secret`).
- `AuthGuard` validates signature and expiration for real.
- The validated identity is propagated downstream via internal headers (`X-User-Id`, `X-User-Sub`).
- **`api` and `orchestrator` do not re-verify the JWT.** They trust the internal headers solely because `NetworkPolicy` (below) guarantees only `gateway` can reach them directly. This is a deliberate "edge-terminated auth" trade-off, not a gap — there is no defense-in-depth at that inner boundary. Next step, if ever needed: mTLS or an internal re-signing secret.

---

## Kubernetes Security

### RBAC — pod delete, scoped in code

`orchestrator-role` grants `get/list/watch/delete` on pods for the namespace — Kubernetes RBAC cannot filter by label natively. The "kill random pod" endpoint must always list pods with `labelSelector: app=api` in code before picking one to delete, so a bug in the RBAC layer alone can't take out Postgres or the gateway. This is a known, declared residual risk (infra-level scoping would need a dedicated namespace) — don't treat it as fully closed.

### NetworkPolicy — full isolation, in layers

- `api` and `orchestrator` accept ingress only from `gateway`.
- `pgbouncer` accepts ingress only from `api` and `orchestrator`.
- `postgres` accepts ingress only from `pgbouncer`.

`ClusterIP` alone does not isolate anything — any pod in the namespace can reach another via internal DNS unless a `NetworkPolicy` says otherwise. Every one of the three tiers above needs its own policy; skipping any one of them reopens the internal attack surface the others just closed.

### Secrets

No password or `JWT_SECRET` in plain text in any manifest. Real values go through `Secret` + `envFrom.secretRef`; only `k8s/secrets.example.yaml` (no real values) is versioned.

---

## Data Layer — PgBouncer

With HPA allowing up to 8 `api` replicas + up to 2 `orchestrator` replicas, default TypeORM pools (10 connections each) can blow past Postgres' `max_connections`. Mitigation:

- PgBouncer in **transaction pooling** mode between services and Postgres.
- Per-pod pool capped at `max: 5` (8 replicas × 5 = 40 connections into PgBouncer, multiplexed down to a much smaller real Postgres pool).

**Non-obvious required fix:** transaction pooling mode is not compatible with prepared statements in most Postgres drivers, including the `pg` driver TypeORM commonly uses — a pooled connection can be reused across different transactions, but a prepared statement is pinned to one connection. **Prepared statements must be disabled on the TypeORM connection** (`prepare: false` / disable statement caching) whenever running behind PgBouncer in transaction mode. Skipping this produces intermittent, hard-to-debug connection errors exactly under the load this project is built to demonstrate.

---

## Circuit Breaker (gateway → api)

- **Opens** after 5 consecutive failures (timeout or 5xx) within a 10s window.
- **Half-open** after 5s, letting exactly 1 test request through.
- **Closes** if that test request succeeds.
- While open, the user gets an immediate `503` with a clear message instead of waiting out the full timeout, and the dashboard reflects circuit state (closed/open/half-open).

Define these thresholds explicitly wherever the breaker is implemented — never leave them as "some reasonable defaults."

---

## Graceful Shutdown

- `terminationGracePeriodSeconds: 30` on `api`/`gateway` Deployments.
- `preStop` hook with `sleep 5` so the endpoint leaves the Service before SIGTERM.
- NestJS `app.enableShutdownHooks()` — finish in-flight requests and close the Postgres connection before exiting.
- Verify this by killing a pod mid-purchase and confirming the user sees no error.

---

## Structured Logging & Correlation ID

- JSON structured logger in every service.
- `correlationId` generated at `gateway` (or read from `X-Correlation-Id`) and propagated to `api`/`orchestrator`, present on every log line tied to that request. This is the primary debugging tool if something breaks live during the demo.

---

## Testing Requirements

- **TDD is mandatory**: RED → GREEN → REFACTOR for every production file; every production file has a matching `.spec.ts`.
- **Unit** — isolated business rules in `api` (stock math, order validation).
- **Integration** — the two concurrency tests above are the most important tests in the repo.
- **E2E (light)** — login → purchase → stock check, via Supertest against `gateway`.
- **Load (k6)** — concurrent requests against `/pedidos` with a `threshold` that **fails the run** on overselling or excess error rate — not just a manual load test.

---

## Naming Conventions

- Files: `kebab-case` (`stock-reservation.service.ts`)
- Classes: `PascalCase` (`StockReservationService`)
- DTOs: suffix `Dto` (`CreatePedidoDto`, `PedidoResponseDto`)
- Mappers: suffix `Mapper`, always a static class (`PedidoMapper`)
- Tables: `snake_case` plural (`pedidos`, `produtos`)
