import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Etapa 7 do ROTEIRO / negocio.md §7.1 + §8: gera carga real contra
// POST /pedidos (via gateway, como um cliente de verdade faria) pra fazer o
// HPA da `api` escalar de fato e o dashboard refletir isso ao vivo.
//
// Uso:
//   k6 run tests/load/pedidos-load.js
//   k6 run -e GATEWAY_URL=http://localhost:3000 -e VUS=50 -e DURATION=60s tests/load/pedidos-load.js
//
// PRODUTO_ID default é o produto de demonstração semeado pela migration
// SeedProdutoCarga1700000000002 — precisa existir no banco antes de rodar.
const GATEWAY_URL = __ENV.GATEWAY_URL ?? 'http://localhost:3000';
const PRODUTO_ID = __ENV.PRODUTO_ID ?? '11111111-1111-4111-8111-111111111111';
const VUS = Number(__ENV.VUS ?? 30);
const DURATION = __ENV.DURATION ?? '60s';

const pedidosConfirmados = new Counter('pedidos_confirmados');
const pedidosRejeitados = new Counter('pedidos_rejeitados');

// 201 (confirmado) e 409 (estoque insuficiente ou idempotency-key repetida)
// são desfechos de negócio esperados sob carga — só status fora dessa lista
// (timeouts, 5xx) deve contar como falha de requisição pro threshold abaixo.
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

export const options = {
  scenarios: {
    pico_black_friday: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Nenhum erro de infraestrutura (timeout, conexão recusada, 5xx) — a
    // API precisa continuar respondendo corretamente mesmo escalando.
    http_req_failed: ['rate<0.01'],
    // Prova de que não há overselling: nunca mais pedidos confirmados do
    // que o estoque inicial semeado pela migration (ESTOQUE_INICIAL_CARGA).
    pedidos_confirmados: ['count<=500'],
  },
};

export function setup() {
  const loginRes = http.post(
    `${GATEWAY_URL}/auth/login`,
    JSON.stringify({ nome: 'k6-load-test' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, { 'login retornou token': (r) => r.status === 201 && !!r.json('accessToken') });

  return { accessToken: loginRes.json('accessToken') };
}

export default function (data) {
  const idempotencyKey = `k6-${__VU}-${__ITER}-${Date.now()}-${Math.random()}`;

  const res = http.post(
    `${GATEWAY_URL}/pedidos`,
    JSON.stringify({ produtoId: PRODUTO_ID, quantidade: 1 }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.accessToken}`,
        'Idempotency-Key': idempotencyKey,
      },
    },
  );

  check(res, { 'status é 201 (confirmado) ou 409 (rejeitado)': (r) => r.status === 201 || r.status === 409 });

  if (res.status === 201) {
    pedidosConfirmados.add(1);
  } else if (res.status === 409) {
    pedidosRejeitados.add(1);
  }

  sleep(0.1);
}
