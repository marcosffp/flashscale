# Flash Sale Black Friday — MVP Kubernetes

Simulates a Black Friday flash sale with real stock-concurrency control, running on Kubernetes with horizontal autoscaling, layered load balancing, and a real-time dashboard showing the cluster react live — kill a pod and watch Kubernetes self-heal, watch the HPA scale under load, watch stock and orders update as concurrent requests race for a limited item.

## Stack

- **Runtime:** Node.js
- **Framework:** NestJS (`gateway`, `api`, `orchestrator`)
- **Frontend:** React + WebSocket (`dashboard`)
- **Database:** PostgreSQL, behind PgBouncer (transaction pooling)
- **Orchestration:** Kubernetes (Minikube/Kind) — HPA, RBAC, NetworkPolicy
- **Load testing:** k6
- **CI:** GitHub Actions — lint + test + build only (no deploy, no issue tracking)

## Structure

```
services/
  gateway/           # Auth (real JWT), rate limiting, L7 proxy, circuit breaker — HPA 2-4
  api/                # Business rules, stock, orders, idempotency — HPA 2-8
  orchestrator/       # Cluster metrics via @kubernetes/client-node, WebSocket, kill-pod endpoint — 1-2 replicas
dashboard/             # React real-time panel
k8s/                   # namespace, secrets, rbac, networkpolicy, deployments, hpa, ingress
tests/
  unit/
  integration/         # concurrency tests — the most important tests in this repo
  load/                # k6 script with failing thresholds
docs/
  plans/               # written by the plan-feature skill
  features/            # written by the feature-tracking skill (local board + per-feature files)
.github/workflows/ci.yaml
```

## Core rule: zero overselling, zero duplication

- Stock decrement is a single atomic `UPDATE ... WHERE estoque_disponivel >= :quantidade`.
- `POST /pedidos` idempotency key is generated once per purchase-attempt session (not per request) and checked atomically via `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` — never `SELECT` then `INSERT`.
- Both are covered by dedicated integration tests that must stay green in CI. Full detail: [[system-architecture]] skill.

## Conventions

- JWT is signed by `gateway`; `api`/`orchestrator` trust the internal `X-User-Id`/`X-User-Sub` headers because `NetworkPolicy` guarantees only `gateway` can reach them directly — no re-verification downstream. Deliberate trade-off, not an oversight.
- Migrations are managed by TypeORM and run via an initContainer/job — never `synchronize: true`.
- Secrets live in Kubernetes `Secret` / local `.env`, never committed — `k8s/secrets.example.yaml` is the versioned template.
- PgBouncer runs in transaction pooling mode — prepared statements must stay disabled on the TypeORM connection.
- TDD is expected on every task: RED → GREEN → REFACTOR.

## Reference document

Full spec, architecture diagram, every resolved contradiction and every consciously-accepted trade-off: [negocio.md](./negocio.md). Kept in this repo — treat it as the source of truth over this file if they ever disagree.

## Local-only workflow

No GitHub issues, no Projects board, no `gh` CLI for planning. Everything is tracked in this repo:

- `plan-feature` skill — writes a plan to `docs/plans/`
- `breakdown-feature` skill — turns a plan into phases/tasks with illustrative prototypes
- `feature-tracking` skill — tracks a feature's steps as a local markdown file plus a row in `docs/features/BOARD.md`
- `system-architecture` skill — architecture reference, read before creating any module, service, or k8s manifest
