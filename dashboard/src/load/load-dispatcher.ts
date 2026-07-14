export interface DispatchLoadOptions {
  gatewayUrl: string;
  produtoId: string;
  totalRequisicoes: number;
  concorrencia: number;
}

export interface DispatchLoadCounts {
  enviados: number;
  confirmados: number;
  rejeitados: number;
  erros: number;
}

/**
 * Dispara carga direto do browser contra POST /pedidos, via gateway — a
 * alternativa que o negocio.md §8 aceita ao k6 pro botão "Disparar carga" do
 * dashboard. Concorrência é limitada por um pool de workers: sem isso, N
 * requisições simultâneas via Promise.all esbarram no limite de conexões
 * por origem do browser e chegam de uma vez só, em vez de sustentar a carga
 * pelo tempo necessário pro HPA reagir.
 */
export async function dispatchLoad(
  options: DispatchLoadOptions,
  onProgress?: (counts: DispatchLoadCounts) => void,
): Promise<DispatchLoadCounts> {
  const { gatewayUrl, produtoId, totalRequisicoes, concorrencia } = options;
  const accessToken = await login(gatewayUrl);

  const counts: DispatchLoadCounts = { enviados: 0, confirmados: 0, rejeitados: 0, erros: 0 };
  let proximoIndice = 0;

  async function worker(): Promise<void> {
    while (proximoIndice < totalRequisicoes) {
      proximoIndice += 1;
      const status = await dispararPedido(gatewayUrl, produtoId, accessToken);

      counts.enviados += 1;
      if (status === 'confirmado') counts.confirmados += 1;
      else if (status === 'rejeitado') counts.rejeitados += 1;
      else counts.erros += 1;

      onProgress?.({ ...counts });
    }
  }

  const workers = Array.from({ length: Math.min(concorrencia, totalRequisicoes) }, () => worker());
  await Promise.all(workers);

  return counts;
}

async function login(gatewayUrl: string): Promise<string> {
  const res = await fetch(`${gatewayUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'carga-dashboard' }),
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  return accessToken;
}

async function dispararPedido(
  gatewayUrl: string,
  produtoId: string,
  accessToken: string,
): Promise<'confirmado' | 'rejeitado' | 'erro'> {
  try {
    const res = await fetch(`${gatewayUrl}/pedidos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ produtoId, quantidade: 1 }),
    });

    if (res.status === 201) return 'confirmado';
    if (res.status === 409) return 'rejeitado';
    return 'erro';
  } catch {
    return 'erro';
  }
}
