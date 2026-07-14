# Documentação técnica — Flash Sale Black Friday

Índice da documentação de arquitetura e componentes deste projeto. Cada arquivo abaixo é focado em uma parte específica do sistema e pode ser lido de forma independente.

| # | Documento | Conteúdo |
|---|---|---|
| 1 | [Visão geral e arquitetura](01-visao-geral-e-arquitetura.md) | O que é o projeto, roteiro de demonstração, arquitetura das três camadas, stack tecnológica e estrutura de pastas |
| 2 | [Serviço `api`](02-servico-api.md) | Regras de negócio: estoque, pedidos, idempotência, migrations, configuração de banco |
| 3 | [Serviço `gateway`](03-servico-gateway.md) | Autenticação JWT, proxy L7, circuit breaker |
| 4 | [Serviço `orchestrator`](04-servico-orchestrator.md) | Leitura do cluster Kubernetes, WebSocket, endpoint de matar pod |
| 5 | [Dashboard (frontend React)](05-dashboard.md) | Componentes visuais, hooks, disparo de carga, proteção contra duplo clique |
| 6 | [Banco de dados e PgBouncer](06-banco-de-dados-e-pgbouncer.md) | Schema, constraints, connection pooling em modo transaction |
| 7 | [Kubernetes — manifests](07-kubernetes.md) | ConfigMap, Secrets, Deployments, Services, HPA, NetworkPolicy, RBAC, graceful shutdown |
| 8 | [Segurança — modelo de confiança](08-seguranca.md) | Fluxo de autenticação de ponta a ponta, trust boundary, rate limiting |
| 9 | [Testes](09-testes.md) | Testes de integração de concorrência, testes unitários, teste de carga k6 |
| 10 | [CI/CD e Docker](10-cicd-e-docker.md) | Pipeline do GitHub Actions, Dockerfiles, docker-compose |
| 11 | [Fluxos completos](11-fluxos-completos.md) | Diagramas de sequência: login, compra, retry, duplo clique, matar pod, circuit breaker |
| 12 | [Trade-offs e como rodar](12-trade-offs-e-como-rodar.md) | Limitações conscientemente aceitas e guia de execução local / Kubernetes |

## Como navegar

- Quer entender o sistema do zero? Comece pelo documento 1.
- Quer mexer em um serviço específico? Vá direto aos documentos 2–5.
- Quer entender por que uma decisão de segurança ou infraestrutura foi tomada? Documentos 6–8 e 12.
- Quer rodar o projeto ou validar uma garantia (zero overselling, self-healing, etc.)? Documentos 9 e 12.
