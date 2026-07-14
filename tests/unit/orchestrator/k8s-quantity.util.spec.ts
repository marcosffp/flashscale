import { parseCpuMillis, parseMemoryMebibytes } from '../../../services/orchestrator/src/cluster/k8s-quantity.util';

describe('parseCpuMillis (negocio.md §8 — CPU por pod via metrics-server)', () => {
  it('converte quantidade em milicores (ex: "250m")', () => {
    expect(parseCpuMillis('250m')).toBe(250);
  });

  it('converte quantidade em núcleos inteiros/decimais (ex: "1", "0.5")', () => {
    expect(parseCpuMillis('1')).toBe(1000);
    expect(parseCpuMillis('0.5')).toBe(500);
  });

  it('converte quantidade em nanocores (ex: "500000000n")', () => {
    expect(parseCpuMillis('500000000n')).toBe(500);
  });

  it('converte quantidade em microcores (ex: "500000u")', () => {
    expect(parseCpuMillis('500000u')).toBe(500);
  });
});

describe('parseMemoryMebibytes (negocio.md §8 — memória por pod via metrics-server)', () => {
  it('converte Mi diretamente', () => {
    expect(parseMemoryMebibytes('128Mi')).toBe(128);
  });

  it('converte Ki para Mi', () => {
    expect(parseMemoryMebibytes('131072Ki')).toBe(128);
  });

  it('converte Gi para Mi', () => {
    expect(parseMemoryMebibytes('1Gi')).toBe(1024);
  });

  it('converte bytes puros (sem unidade) para Mi', () => {
    expect(parseMemoryMebibytes('134217728')).toBe(128);
  });

  it('retorna 0 para entrada inválida', () => {
    expect(parseMemoryMebibytes('')).toBe(0);
  });
});
