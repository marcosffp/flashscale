# Como testar e ver a plataforma funcionando

Guia prático de validação do projeto — dos testes automatizados até o cluster
Kubernetes reagindo ao vivo no dashboard. Reflete o estado **real** do
repositório (não a arquitetura-alvo do `negocio.md` §2/§8/§10 — ver a seção
[Diferenças entre o negocio.md e o código atual](#diferenças-entre-o-negociomd-e-o-código-atual)
no final).

---

## 0. Pré-requisitos

| Ferramenta | Uso |
|---|---|
| Node.js 20 | rodar os 3 serviços NestJS e o dashboard |
| Docker | Postgres/PgBouncer local (docker-compose) e build das imagens |
| Minikube ou Kind | cluster Kubernetes local (Modo 3) |
| `kubectl` | aplicar manifests, `port-forward`, `scale`, `delete pod` |
| addon `metrics-server` do Minikube | CPU/memória por pod (HPA e dashboard dependem disso) |
| [k6](https://k6.io/docs/get-started/installation/) | script de carga oficial (`tests/load/pedidos-load.js`) |
| `wscat` (opcional) | inspecionar o WebSocket do `orchestrator` manualmente |
| `psql` ou `docker exec` | olhar/ajustar o estoque direto no Postgres (não existe endpoint de leitura de estoque — ver seção 7) |

Instalar dependências uma vez:

```bash
npm install
npm run dashboard:install
```

---

## 1. Testes automatizados (o critério de "pronto" real do projeto)

Isto é o que a CI roda (`.github/workflows/ci.yaml`) e o que garante zero
overselling / zero duplicação — comece sempre por aqui.

### 1.1 Lint

```bash
npm run lint                          # gateway/api/orchestrator
npm --prefix dashboard run lint       # dashboard
```

### 1.2 Testes unitários

```bash
npm run test:unit          # gateway/api/orchestrator (jest.unit.config.js)
npm run dashboard:test     # dashboard (vitest)
```

### 1.3 Testes de integração — os mais importantes do repo

Sobem Postgres + PgBouncer de teste via docker-compose, rodam as migrations
contra eles e então os testes de concorrência de verdade:

```bash
npm run docker:up                       # sobe postgres, postgres-test, pgbouncer, pgbouncer-test
npm run test:integration                # usa .env.test (porta 6433, via pgbouncer-test)
```

O que observar:

- `tests/integration/estoque-concorrencia.spec.ts` — dispara **10 pedidos
  simultâneos** contra um produto com **estoque 5** e verifica que
  **exatamente 5** são confirmados e 5 rejeitados, nunca mais que 5.
  Rode mais de uma vez (`npm run test:integration` de novo) — a race
  condition só é convincente se passar de forma consistente, não só na
  sorte.
- `tests/integration/idempotencia-concorrencia.spec.ts` — mesma
  `Idempotency-Key` disparada em paralelo nunca cria mais de um pedido
  (`INSERT ... ON CONFLICT DO NOTHING`).
- `tests/integration/gateway/*.spec.ts` — proxy L7 + circuit breaker do
  `gateway`.

Se algum desses quebrar depois de mexer no `UPDATE ... WHERE
estoque_disponivel >= :quantidade` ou no `ON CONFLICT`, é sinal de que a
garantia central do projeto foi violada — pare e corrija antes de qualquer
outra coisa.

### 1.4 Teste de carga (k6) — precisa da API já rodando (Modo 2 ou 3)

```bash
k6 run tests/load/pedidos-load.js
# ou apontando pra outro host/carga:
k6 run -e GATEWAY_URL=http://localhost:3000 -e VUS=50 -e DURATION=60s tests/load/pedidos-load.js
```

Fail se `http_req_failed` (timeouts/5xx) passar de 1% ou se
`pedidos_confirmados` passar de 500 — esse segundo threshold é a prova de
"zero overselling" sob carga real, não só nos testes de integração
in-process. O script faz login (`POST /auth/login`) e usa o produto semeado
pela migration `SeedProdutoCarga1700000000002` (`estoque_disponivel = 500`,
id fixo `11111111-1111-4111-8111-111111111111`).

---

## 2. Modo 2 — Rodando local sem Kubernetes (mais rápido pra ver a regra de negócio)

Bom para validar login + compra + idempotência rapidamente. **Não mostra**
HPA, self-healing, RBAC nem NetworkPolicy — pra isso, vá direto ao Modo 3.

```bash
npm run docker:up          # postgres (5432) + pgbouncer (6432) locais
cp .env.example .env       # se ainda não existir
npm run migration:run      # roda migrations via pgbouncer, cria produtos/pedidos + seed de carga

# 3 terminais separados:
npm run start:dev              # api        → :3001
npm run start:gateway:dev      # gateway    → :3000 (proxy pra api)
npm run start:orchestrator:dev # orchestrator → :3002 (lê o kubeconfig local — só funciona
                                # de verdade se houver um cluster ativo, ver Modo 3)

npm run dashboard:dev           # → http://localhost:5173
```

Testando manualmente com `curl`:

```bash
# 1. Login (sem senha — só nome)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"nome":"maria"}' | jq -r .accessToken)

# 2. Compra — precisa do header Idempotency-Key
curl -i -X POST http://localhost:3000/pedidos \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"produtoId":"11111111-1111-4111-8111-111111111111","quantidade":1}'
# 201 = confirmado · 409 = sem estoque OU idempotency-key repetida

# 3. Repita a MESMA Idempotency-Key duas vezes seguidas → segunda chamada
#    tem que voltar 409 sem criar um segundo pedido (idempotência de verdade)

# 4. Sem token → 401
curl -i -X POST http://localhost:3000/pedidos -d '{}'
```

---

## 3. Modo 3 — Kubernetes local (Minikube) — o cenário "de verdade"

É aqui que dá pra ver HPA escalando, self-healing ao matar pod, RBAC e
NetworkPolicy funcionando. `orchestrator` e `dashboard` **rodam fora do
cluster**, no host — não existem `deployment-orchestrator.yaml` nem
`deployment-dashboard.yaml` no repo (ver seção final).

### 3.1 Subir o cluster

```bash
minikube start
minikube addons enable metrics-server
kubectl config use-context minikube
```

### 3.2 Construir as imagens dentro do Docker do Minikube

Os deployments usam `imagePullPolicy: Never` — as imagens precisam existir
no daemon Docker do Minikube, não no seu Docker local:

```bash
eval $(minikube docker-env)   # troca o daemon docker do shell atual pro do minikube

docker build -f services/api/Dockerfile -t flashscale-api:local .
docker build -f services/gateway/Dockerfile -t flashscale-gateway:local .
docker build -f services/orchestrator/Dockerfile -t flashscale-orchestrator:local .
```

(`flashscale-orchestrator:local` não é usada por nenhum manifest hoje, mas
buildar não custa nada caso você queira rodá-la em pod manualmente.)

### 3.3 Secrets

```bash
cp k8s/secrets.example.yaml k8s/secrets.yaml
# edite k8s/secrets.yaml com POSTGRES_PASSWORD e JWT_SECRET reais — este
# arquivo é gitignored, nunca commitar
```

### 3.4 Aplicar os manifests (ordem importa por causa das dependências)

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/rbac.yaml

kubectl apply -f k8s/postgres-pvc.yaml
kubectl apply -f k8s/deployment-postgres.yaml
kubectl apply -f k8s/service-postgres.yaml

kubectl apply -f k8s/deployment-pgbouncer.yaml
kubectl apply -f k8s/service-pgbouncer.yaml

kubectl apply -f k8s/deployment-api.yaml
kubectl apply -f k8s/service-api.yaml
kubectl apply -f k8s/hpa-api.yaml

kubectl apply -f k8s/deployment-gateway.yaml
kubectl apply -f k8s/service-gateway.yaml

kubectl apply -f k8s/networkpolicy-postgres.yaml
kubectl apply -f k8s/networkpolicy-api.yaml
kubectl apply -f k8s/networkpolicy-orchestrator.yaml   # orchestrator não roda no
                                                         # cluster hoje, mas a policy
                                                         # já existe pra quando rodar
```

Acompanhe até tudo ficar `Running`/`Ready`:

```bash
kubectl -n blackfriday get pods -w
```

O `initContainer` do `api` (`migrate`) roda as migrations via PgBouncer antes
do container principal subir — se o pod `api` ficar preso em `Init`, veja os
logs dele: `kubectl -n blackfriday logs <pod-api> -c migrate`.

### 3.5 Expor gateway (não há Ingress no repo — usar port-forward)

```bash
kubectl -n blackfriday port-forward svc/gateway 3000:3000
```

Repita o `curl` da seção 2 trocando só a base URL se precisar — o fluxo é
idêntico, agora contra o cluster real.

### 3.6 Rodar `orchestrator` e `dashboard` locais, apontando pro cluster

```bash
# terminal separado — usa o kubeconfig do seu host (kubeConfig.loadFromDefault())
CLUSTER_NAMESPACE=blackfriday ORCHESTRATOR_PORT=3002 npm run start:orchestrator:dev
```

```bash
cp dashboard/.env.example dashboard/.env   # já aponta pra localhost:3000/3002 por padrão
npm run dashboard:dev                       # http://localhost:5173
```

Abra `http://localhost:5173` — depois de ~2s (intervalo de poll do
orchestrator) o snapshot do cluster deve aparecer: Deployments (`api`,
`gateway`, `orchestrator`) com réplicas atuais, e a lista de pods com
status/CPU/memória.

---

## 4. Validando cada garantia central ao vivo

### 4.1 Zero overselling sob carga real

Com o Modo 3 no ar (ou Modo 2, se só quiser ver a API reagindo):

```bash
k6 run -e GATEWAY_URL=http://localhost:3000 tests/load/pedidos-load.js
```

ou, no dashboard, clique **"Disparar carga"** (painel `LoadTestPanel`) — ele
dispara 200 requisições com concorrência 20 direto do browser contra o
`gateway` e mostra em tempo real: enviados / confirmados / rejeitados /
erros. Confirme que `confirmados` nunca passa do estoque disponível do
produto de carga (500, a menos que já tenha sido consumido por rodadas
anteriores — ver seção 7 para resetar).

### 4.2 HPA escalando de verdade

```bash
kubectl -n blackfriday get hpa -w
kubectl -n blackfriday get pods -l app=api -w   # em outro terminal
```

Dispare carga (k6 ou botão "Disparar carga") e observe `REPLICAS` subir de 2
até no máximo 8 conforme o `TARGET` de CPU passa de 70%. O dashboard reflete
a mesma coisa no painel **Deployments** sem precisar dar refresh (poll de
2s do `orchestrator`).

Se o HPA não reagir: confira `kubectl -n blackfriday top pods` — se vier
vazio, o `metrics-server` não está habilitado (`minikube addons enable
metrics-server`) ou ainda não coletou a primeira amostra (~1min).

### 4.3 Self-healing (matar pod)

Pelo dashboard: botão **"Matar pod aleatório"** (`KillPodPanel`) → chama
`POST /pods/kill` no `orchestrator`, que só mata pods com label `app=api`
(filtro em código — o RBAC do cluster permite `delete` em qualquer pod do
namespace, é um trade-off aceito e documentado, não um bug).

Ou manual:

```bash
kubectl -n blackfriday delete pod -l app=api --field-selector status.phase=Running -o name | head -1 | xargs kubectl -n blackfriday delete
```

Observe no painel **Pods** o pod sumir e um novo aparecer sozinho
(`Deployment` recriando pra manter `replicas: 2`), sem que uma compra em
andamento (dispare carga simultaneamente) retorne erro pro cliente —
`terminationGracePeriodSeconds: 30` + `preStop sleep 5` existem exatamente
pra isso.

### 4.4 NetworkPolicy — isolamento real, não só ClusterIP

```bash
kubectl -n blackfriday run debug --rm -it --image=curlimages/curl -- sh
# dentro do pod de debug:
curl -m 3 http://api:3001/pedidos        # deve travar/timeout — só gateway pode chamar api
curl -m 3 http://postgres:5432           # deve travar/timeout — só pgbouncer pode chamar postgres
curl -m 3 http://gateway:3000/auth/login # este passa — gateway aceita qualquer origem no namespace
```

Se `curl -m 3 http://api:3001/...` responder normalmente em vez de dar
timeout, a `NetworkPolicy` não está sendo aplicada — confirme que o plugin
CNI do seu cluster suporta `NetworkPolicy` (o driver padrão do Minikube às
vezes não; pode ser necessário `minikube start --cni=calico`).

### 4.5 Circuit breaker do gateway

Force falhas na `api` (ex: `kubectl -n blackfriday scale deployment/api
--replicas=0` por alguns segundos) e dispare requisições contra
`/pedidos` via `gateway`. Depois de 5 falhas em 10s o circuito abre: as
próximas chamadas voltam `503` imediato (sem esperar timeout), e o painel
**CircuitBreakerPanel** no dashboard muda de estado (fechado → aberto →
meio-aberto → fechado) puxando `GET /circuit-breaker/status` do próprio
`gateway`. Volte a `api` pra 2 réplicas pra fechar o circuito de novo.

### 4.6 Graceful shutdown / PgBouncer sob carga

Dispare carga (k6, `VUS=30` ou mais) e, no meio, mate um pod da `api`
(seção 4.3). Critério de sucesso: `http_req_failed` do k6 continua baixo
(sem pico de 5xx/timeout durante o kill) — é exatamente o que o threshold
`http_req_failed: ['rate<0.01']` no script de carga verifica.

---

## 5. Inspecionar o WebSocket do orchestrator manualmente

Sem passar pelo dashboard:

```bash
wscat -c ws://localhost:3002
```

Deve chegar um snapshot JSON a cada ~2s, formato:

```json
{
  "timestamp": "2026-07-14T12:00:00.000Z",
  "deployments": [{ "name": "api", "replicas": 2, "readyReplicas": 2 }],
  "pods": [{ "name": "api-xxxx", "app": "api", "status": "Running", "cpuMillis": 12, "memoryMebibytes": 80 }]
}
```

---

## 6. Rodando `kubectl scale` manual (validação da Etapa 6 do ROTEIRO)

Antes de confiar no HPA, valide que o dashboard reflete qualquer mudança de
réplicas, não só as feitas pelo HPA:

```bash
kubectl -n blackfriday scale deployment/api --replicas=5
```

O painel **Deployments** deve mostrar 5 réplicas em até ~2s, sem refresh.

---

## 7. Resetando o estoque entre rodadas de demo

**Não existe endpoint HTTP pra ler ou resetar estoque** (o `negocio.md`
§4.4 menciona um endpoint `/admin/reset`, mas ele não está implementado no
código atual). Depois de rodar carga algumas vezes o produto de demonstração
(`11111111-1111-4111-8111-111111111111`) esgota. Pra resetar direto no
banco:

```bash
# Modo 2 (docker-compose local)
docker exec -it flashscale-postgres psql -U flashscale -d flashscale \
  -c "UPDATE produtos SET estoque_disponivel = 500 WHERE id = '11111111-1111-4111-8111-111111111111';"

# Modo 3 (Minikube)
kubectl -n blackfriday exec -it deploy/postgres -- psql -U flashscale -d flashscale \
  -c "UPDATE produtos SET estoque_disponivel = 500 WHERE id = '11111111-1111-4111-8111-111111111111';"
```

Pra ver o estoque atual sem resetar, troque o `UPDATE` por `SELECT
estoque_disponivel FROM produtos WHERE id = '...'`.

---

## 8. Troubleshooting comum

| Sintoma | Causa provável |
|---|---|
| `test:integration` falha de conexão | `npm run docker:up` não rodou, ou o Postgres de teste ainda não passou o healthcheck — espere alguns segundos e rode de novo |
| Pod `api` preso em `Init:0/1` | migration falhando — `kubectl -n blackfriday logs <pod> -c migrate`, geralmente secret/configmap errado |
| `kubectl top pods` vazio | `metrics-server` não habilitado ou sem amostra ainda (~1 min de espera) |
| HPA não escala mesmo com CPU alta | confirme `kubectl -n blackfriday describe hpa api` — `unknown` em `TARGETS` quase sempre é metrics-server ausente |
| Dashboard fica em "Aguardando o primeiro snapshot" | `orchestrator` não está rodando, ou `VITE_ORCHESTRATOR_WS_URL` não bate com a porta real |
| `curl` de dentro do cluster não trava mesmo com NetworkPolicy aplicada | CNI do cluster local não aplica `NetworkPolicy` (comum no driver padrão do Minikube) |
| `k6` retorna só 401 | esqueceu de rodar `migration:run` (produto de carga não existe) ou o `gateway` não está no ar |

---

## Diferenças entre o `negocio.md` e o código atual

O `negocio.md` é a fonte da verdade conceitual do projeto, mas alguns itens
descritos lá como arquitetura-alvo ainda não têm manifest/endpoint
correspondente no repositório hoje. Vale saber antes de procurar por eles:

- **`orchestrator` e `dashboard` não têm Deployment/Service no `k8s/`** —
  `negocio.md` §10 lista `deployment-orchestrator.yaml`,
  `deployment-dashboard.yaml`, `service-orchestrator.yaml`,
  `service-dashboard.yaml`, `hpa-gateway.yaml` e `ingress.yaml`, mas nenhum
  desses arquivos existe em `k8s/`. Na prática, os dois rodam localmente no
  host (Modo 3 acima) — `orchestrator` conecta no cluster via kubeconfig
  local (`loadFromDefault()`), não `loadFromCluster()`. Só existe
  `networkpolicy-orchestrator.yaml`, já preparada para quando isso mudar.
- **Sem `ingress.yaml`** — acesso ao `gateway` é via `kubectl port-forward`
  (seção 3.5), não Ingress.
- **Sem HPA no `gateway`** — só existe `k8s/hpa-api.yaml`; o `hpa-gateway.yaml`
  citado no §2/§10 do `negocio.md` não foi criado.
- **Dashboard não tem painel de estoque nem contador de pedidos
  aceitos/rejeitados como visualização persistente do cluster** —
  `negocio.md` §8 descreve "gráfico de estoque disponível caindo em tempo
  real" e "contador de pedidos aceitos vs. rejeitados". O que existe hoje é
  o contador *da rodada de carga atual* dentro do próprio
  `LoadTestPanel` (zera a cada clique em "Disparar carga"), não um contador
  agregado/histórico. Os únicos painéis reais são: `LoadTestPanel`,
  `KillPodPanel`, `CircuitBreakerPanel`, `DeploymentsPanel`, `PodsList`.
- **Sem endpoint de leitura/reset de estoque** — `negocio.md` §4.4 menciona
  um endpoint de reset; não existe no código (ver seção 7 acima para o
  workaround via SQL direto).

Nenhum desses gaps compromete a garantia central do projeto (zero
overselling / zero duplicação, cobertas pelos testes da seção 1.3) — são
lacunas de "vitrine" (dashboard/observabilidade), não de regra de negócio.
