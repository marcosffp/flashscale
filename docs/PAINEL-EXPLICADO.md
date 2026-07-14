# O que é cada coisa na tela do painel

Guia visual do dashboard (`dashboard/`) explicando **cada elemento da tela**,
sem exigir nenhum conhecimento do código. Serve pra qualquer pessoa que abra o
painel e queira entender o que está olhando.

A tela inteira representa **um cluster Kubernetes rodando uma simulação de
flash sale (Black Friday)**: existem 3 serviços rodando dentro do cluster
(`gateway`, `api`, `orchestrator`), cada um com vários "pods" (cópias do
serviço rodando em paralelo), e o painel mostra o estado desse cluster **ao
vivo**, atualizando sozinho via WebSocket.

---

## 1. Cabeçalho

```
🟢 Flash Sale — Painel do Cluster              Última atualização: 17:24:59
```

- **Bolinha verde/amarela/vermelha** — indicador de conexão do painel com o
  `orchestrator` (o serviço que manda os dados do cluster pro navegador via
  WebSocket):
  - 🟢 **verde** = conectado, recebendo dados ao vivo.
  - 🟡 **amarelo** = conectando/reconectando.
  - 🔴 **vermelho** = conexão caiu (nesse caso aparece também um aviso
    vermelho de "Conexão perdida" logo abaixo do cabeçalho).
- **Última atualização** — horário do último "snapshot" (foto instantânea) do
  cluster que chegou. Como é tempo real, esse relógio fica avançando sozinho
  a cada poucos segundos.

---

## 2. Os três cartões de controle (topo)

São **botões de ação pra você mesmo provocar coisas no cluster** e ver o
painel reagir — não é só um mostrador passivo.

### 2.1 "Disparar carga"

```
[Disparar carga]
200/200 enviados   0 confirmados   200 rejeitados
0 erros
```

- O botão azul dispara uma **rajada de pedidos de compra simultâneos**
  contra o produto da simulação (200 requisições ao mesmo tempo, por padrão),
  simulando um monte de gente tentando comprar o mesmo item no mesmo segundo
  numa flash sale.
- **enviados** — quantas requisições já foram disparadas do total (ex.:
  `200/200` = já disparou todas).
- **confirmados** (verde) — quantos pedidos foram aceitos de verdade (o
  estoque foi debitado com sucesso pra aquele comprador).
- **rejeitados** (amarelo) — quantos pedidos foram recusados porque o
  estoque já tinha acabado quando a requisição chegou. É esperado e correto
  ter rejeitados numa flash sale — é a prova de que o sistema não vende mais
  do que tem em estoque (não deixa "overselling" acontecer), mesmo com muita
  gente comprando ao mesmo tempo.
- **erros** (vermelho) — requisições que falharam por motivo técnico
  (rede, servidor fora, etc.), não por falta de estoque. Idealmente fica
  sempre em 0.

No print, `0 confirmados` com `200 rejeitados` normalmente quer dizer que o
produto de teste já estava com estoque zerado antes do disparo (não é um bug
do painel — é só o estado do estoque no banco naquele momento).

### 2.2 "Matar pod aleatório"

```
[Matar pod aleatório]
Pod api-b7bb7674c-xsxxz matado — aguardando o Kubernetes recriar.
```

- Botão vermelho que **derruba de propósito uma cópia (pod) do serviço**
  escolhida aleatoriamente, simulando uma falha real (crash, máquina caiu,
  etc.).
- A mensagem verde abaixo confirma qual pod foi morto.
- É a demonstração do **"self-healing" do Kubernetes**: alguns segundos
  depois de matar, o Kubernetes sobe uma cópia nova sozinho pra repor a que
  morreu, sem ninguém mexer em nada — e isso aparece automaticamente na
  tabela de Pods e no diagrama de fluxo (seção 4), com o nome do pod novo
  substituindo o antigo.

### 2.3 "Circuit breaker"

```
Circuit breaker   [Fechado]
```

Indicador do estado de um mecanismo de proteção do `gateway` (o "circuit
breaker" / disjuntor) que existe pra evitar que uma falha em cascata
derrube o sistema inteiro. Três estados possíveis:

- **Fechado** (verde) — tudo normal, as requisições passam direto.
- **Aberto** (vermelho) — o gateway detectou muita falha recente e está
  **bloqueando** novas requisições de propósito por um tempo, pra dar
  espaço do serviço se recuperar (em vez de continuar martelando um serviço
  que já está com problema).
- **Meio-aberto** (amarelo) — período de teste: o gateway está deixando
  passar algumas requisições de novo pra ver se o serviço já se recuperou,
  antes de voltar a "Fechado" totalmente.

---

## 3. "Fluxo do cluster" — o diagrama central

Esta é a parte visual que mostra **a arquitetura do sistema em funcionamento**,
da esquerda pra direita, seguindo o caminho de uma requisição:

```
👥 Clientes → 🛡 Gateway → 📦 API → 📡 Orchestrator     🗄 Estoque
              (load balancing)                            ↑
                                        └──────────────────┘
```

- **Clientes** (ícone de pessoas) — representa os usuários/compradores
  fazendo requisições de fora. Não é um serviço real, é só o ponto de
  partida do desenho.

- **Gateway** (ícone de escudo) — o serviço que recebe todo o tráfego
  primeiro. Cuida de autenticação, limite de requisições por segundo
  (rate limit) e repassa a requisição pra frente. As **bolinhas coloridas
  dentro do cartão** (ex.: `● ●`) representam **cada pod (cópia) do gateway
  rodando agora** — se você passar o mouse em cima de uma bolinha, aparece o
  nome exato do pod e o status dele.
  - 🟢 bolinha verde = pod rodando normalmente ("Running").
  - 🟡 bolinha amarela (piscando) = pod subindo, ainda não pronto ("Pending").
  - 🔴 bolinha vermelha (piscando) = pod sendo desligado ("Terminating").

- **"LOAD BALANCING"** (rótulo azul na seta entre Gateway e API) — indica
  que o Gateway não manda todo o tráfego pra uma cópia só da API: ele
  **distribui as requisições entre todas as cópias da API disponíveis**,
  balanceando a carga. É por isso que a API normalmente tem várias bolinhas
  (vários pods) — quanto mais gente comprando ao mesmo tempo, mais cópias
  entram pra dar conta do volume.

- **API** (ícone de cubo) — o serviço que faz a parte "de negócio": controla
  estoque, cria pedidos, garante que ninguém compre um item que já acabou e
  que ninguém compre duas vezes sem querer (idempotência). Mesma lógica de
  bolinhas = pods rodando.

- **Orchestrator** (ícone de radar) — não participa da fila de compra; ele
  fica **observando o cluster inteiro** (quantos pods existem, status de
  cada um, CPU/memória) e é quem manda esses dados pro painel via WebSocket
  em tempo real. Também é ele quem executa o "Matar pod aleatório" da seção
  2.2. É normal esse cartão aparecer com **um círculo tracejado vazio** em
  vez de bolinhas — significa que não há nenhum pod dele rodando no momento
  (ex.: ele roda como réplica única e reaproveita um pod que não aparece
  separado, ou está com 0 réplicas na configuração atual).

- **Estoque** (ícone de banco de dados/cilindro) — representa o banco de
  dados onde o estoque e os pedidos são gravados de verdade. Também é só
  ilustrativo, não é um "nó" clicável.

**Resumo da leitura do diagrama:** cliente entra pelo Gateway → Gateway
distribui (load balancing) entre as cópias da API → API debita o estoque no
banco → Orchestrator, em paralelo, fica de olho em tudo isso e alimenta o
resto do painel.

---

## 4. "Deployments"

```
gateway         2/2   [estável]
api             2/2   [estável]
orchestrator    0/0   [estável]
```

Tabela com o **estado desejado vs. real de cada serviço**, no vocabulário do
Kubernetes:

- **Nome** — qual serviço (`gateway`, `api`, `orchestrator`).
- **Números (ex.: `2/2`)** — "quantos pods estão prontos" / "quantos pods
  deveriam existir". `2/2` = tudo certo, as 2 cópias que deveriam estar de pé
  estão de pé. Se alguém matar um pod (seção 2.2), esse número cai
  temporariamente (ex. `1/2`) até o Kubernetes recriar o pod que faltou.
- **estável / escalando** (selo colorido):
  - **estável** (verde) — o número de pods prontos bate com o desejado.
  - **escalando** (amarelo) — ainda faltam pods ficarem prontos (acabou de
    subir mais réplicas por causa de carga alta, ou está se recuperando de
    um pod morto). É o momento em que o **HPA (autoscaler)** do Kubernetes
    está aumentando ou diminuindo a quantidade de cópias automaticamente
    conforme o uso de CPU sobe ou desce.

---

## 5. "Pods"

```
POD                        APP       STATUS     CPU    MEMÓRIA
api-b7bb7674c-cjspj         api       Running    5m     38.5Mi
gateway-df65b4f79-5tfqg     gateway   Running    0m     26.0Mi
```

Lista **detalhada**, pod por pod (o mesmo que as bolinhas do diagrama da
seção 3, só que em formato de tabela com mais informação):

- **Pod** — nome único do pod. O sufixo aleatório (ex. `-cjspj`) é gerado
  pelo próprio Kubernetes toda vez que cria uma cópia nova; por isso o nome
  muda quando um pod morre e é recriado.
- **App** — a qual serviço esse pod pertence (`gateway`, `api` ou
  `orchestrator`).
- **Status** — fase atual do pod: `Running` (rodando normalmente), `Pending`
  (ainda inicializando) ou `Terminating` (sendo desligado). Cores seguem o
  mesmo padrão das bolinhas (verde/amarelo/vermelho).
- **CPU** — quanto de processador aquele pod está consumindo agora, em
  "millicores" (`5m` = 5 milésimos de um núcleo de CPU — é normal ser um
  número baixo em repouso e subir bastante durante o "Disparar carga").
- **Memória** — quanta memória RAM aquele pod está usando, em MiB
  (mebibytes). Um traço (`—`) aparece quando essa informação ainda não
  chegou do Kubernetes (leva alguns segundos após o pod nascer).

---

## Por que a tela parece "estranha" à primeira vista

Ela mistura três tipos de informação bem diferentes na mesma tela de
propósito:

1. **Controles de ação** (topo) — coisas que você aperta pra provocar o
   sistema (gerar carga, matar pod).
2. **Visão de arquitetura** (fluxo do cluster) — um resumo visual e
   simplificado de como as peças se conectam.
3. **Dados crus do Kubernetes** (Deployments e Pods) — a mesma informação
   do item 2, só que em detalhe total, como se você tivesse rodando
   `kubectl get pods` na mão.

Ou seja: o item 2 é a "foto resumida" e o item 3 é o "raio-x" da mesma
realidade — por isso números e cores se repetem entre eles, isso é
intencional (mostrar tudo de dois jeitos, um visual/rápido e um detalhado).
