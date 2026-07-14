import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KillPodPanel } from './KillPodPanel';

describe('KillPodPanel (negocio.md §5.1 — botão "matar pod")', () => {
  const props = { orchestratorHttpUrl: 'http://orchestrator.local' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function criarPromiseControlavel<T>() {
    let resolver!: (value: T) => void;
    let rejeitador!: (erro: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolver = resolve;
      rejeitador = reject;
    });
    return { promise, resolver, rejeitador };
  }

  it('mostra o botão "Matar pod aleatório" em repouso', () => {
    render(<KillPodPanel {...props} />);

    expect(screen.getByRole('button', { name: /matar pod aleatório/i })).toBeEnabled();
  });

  it('chama POST /pods/kill no orchestrator ao clicar', () => {
    const { promise } = criarPromiseControlavel<Response>();
    const fetchMock = vi.fn().mockReturnValue(promise);
    vi.stubGlobal('fetch', fetchMock);

    render(<KillPodPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /matar pod aleatório/i }));

    expect(fetchMock).toHaveBeenCalledWith('http://orchestrator.local/pods/kill', { method: 'POST' });
  });

  it('desabilita o botão enquanto a chamada está em andamento', async () => {
    const { promise } = criarPromiseControlavel<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(promise));

    render(<KillPodPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /matar pod aleatório/i }));

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('mostra o nome do pod deletado e reabilita o botão quando a chamada termina com sucesso', async () => {
    const { promise, resolver } = criarPromiseControlavel<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(promise));

    render(<KillPodPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /matar pod aleatório/i }));

    await act(async () => {
      resolver({ ok: true, json: async () => ({ podName: 'api-abc123' }) } as Response);
      await promise;
    });

    expect(screen.getByTestId('kill-pod-resultado')).toHaveTextContent('api-abc123');
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('mostra uma mensagem de erro quando a chamada falha', async () => {
    const { promise, resolver } = criarPromiseControlavel<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(promise));

    render(<KillPodPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /matar pod aleatório/i }));

    await act(async () => {
      resolver({ ok: false, json: async () => ({ message: 'Nenhum pod da api encontrado' }) } as Response);
      await promise;
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/nenhum pod da api encontrado/i);
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
