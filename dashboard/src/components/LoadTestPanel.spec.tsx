import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadTestPanel } from './LoadTestPanel';
import type { DispatchLoadCounts } from '../load/load-dispatcher';

const { dispatchLoadMock } = vi.hoisted(() => ({ dispatchLoadMock: vi.fn() }));

vi.mock('../load/load-dispatcher', () => ({
  dispatchLoad: dispatchLoadMock,
}));

function criarPromiseControlavel() {
  let resolver!: (counts: DispatchLoadCounts) => void;
  const promise = new Promise<DispatchLoadCounts>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolver };
}

describe('LoadTestPanel', () => {
  const props = { gatewayUrl: 'http://gateway.local', produtoId: '11111111-1111-4111-8111-111111111111' };

  it('mostra o botão "Disparar carga" em repouso', () => {
    render(<LoadTestPanel {...props} />);

    expect(screen.getByRole('button', { name: /disparar carga/i })).toBeEnabled();
  });

  it('chama dispatchLoad com a URL do gateway e o produtoId ao clicar', () => {
    const { promise } = criarPromiseControlavel();
    dispatchLoadMock.mockReturnValue(promise);

    render(<LoadTestPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /disparar carga/i }));

    expect(dispatchLoadMock).toHaveBeenCalledTimes(1);
    const [options] = dispatchLoadMock.mock.calls[0];
    expect(options).toMatchObject({ gatewayUrl: props.gatewayUrl, produtoId: props.produtoId });
  });

  it('desabilita o botão e mostra o progresso enquanto a carga está em andamento', async () => {
    const { promise, resolver } = criarPromiseControlavel();
    let onProgress!: (counts: DispatchLoadCounts) => void;
    dispatchLoadMock.mockImplementation((_options, progressCb) => {
      onProgress = progressCb;
      return promise;
    });

    render(<LoadTestPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /disparar carga/i }));

    expect(screen.getByRole('button')).toBeDisabled();

    act(() => {
      onProgress({ enviados: 3, confirmados: 2, rejeitados: 1, erros: 0 });
    });

    expect(screen.getByText(/3/)).toBeInTheDocument();

    await act(async () => {
      resolver({ enviados: 10, confirmados: 8, rejeitados: 2, erros: 0 });
      await promise;
    });
  });

  it('reabilita o botão e mostra o resultado final quando a carga termina', async () => {
    const { promise, resolver } = criarPromiseControlavel();
    dispatchLoadMock.mockReturnValue(promise);

    render(<LoadTestPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /disparar carga/i }));

    await act(async () => {
      resolver({ enviados: 10, confirmados: 8, rejeitados: 2, erros: 0 });
      await promise;
    });

    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.getByTestId('load-confirmados')).toHaveTextContent('8');
    expect(screen.getByTestId('load-rejeitados')).toHaveTextContent('2');
    expect(screen.getByTestId('load-erros')).toHaveTextContent('0');
  });
});
