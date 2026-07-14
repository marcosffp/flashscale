// Parsers para o formato de "quantity" do Kubernetes (ex: "250m", "1", "128Mi"),
// usado pelas respostas do metrics-server (negocio.md §8). Não existe conversão
// pronta no @kubernetes/client-node — os valores chegam como string crua.

const MEMORY_UNIT_MULTIPLIERS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
};

export function parseCpuMillis(cpu: string): number {
  if (cpu.endsWith('n')) {
    return Math.round(parseFloat(cpu) / 1e6);
  }
  if (cpu.endsWith('u')) {
    return Math.round(parseFloat(cpu) / 1e3);
  }
  if (cpu.endsWith('m')) {
    return Math.round(parseFloat(cpu));
  }
  return Math.round(parseFloat(cpu) * 1000);
}

export function parseMemoryMebibytes(memory: string): number {
  const match = memory.match(/^(\d+(?:\.\d+)?)([A-Za-z]*)$/);
  if (!match) {
    return 0;
  }

  const [, valor, unidade] = match;
  const multiplicador = unidade ? MEMORY_UNIT_MULTIPLIERS[unidade] : undefined;
  const bytes = multiplicador ? parseFloat(valor) * multiplicador : parseFloat(valor);

  return bytes / 1024 ** 2;
}
