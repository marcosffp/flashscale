import { useEffect, useState } from 'react';
import type { ClusterSnapshot } from '../types/cluster-snapshot';

export type ConnectionStatus = 'conectando' | 'aberta' | 'fechada';

export interface UseClusterSnapshotResult {
  snapshot: ClusterSnapshot | null;
  status: ConnectionStatus;
}

const RECONNECT_DELAY_MS = 2000;

export function useClusterSnapshot(url: string): UseClusterSnapshotResult {
  const [snapshot, setSnapshot] = useState<ClusterSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('conectando');

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      setStatus('conectando');
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (!cancelled) setStatus('aberta');
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        setSnapshot(JSON.parse(event.data as string) as ClusterSnapshot);
      };

      // A conexão cai eventualmente (deploy do orchestrator, rede local
      // instável) — sem reconexão automática o dashboard travaria no último
      // snapshot em vez de voltar a refletir o cluster ao vivo.
      socket.onclose = () => {
        if (cancelled) return;
        setStatus('fechada');
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket.close();
    };
  }, [url]);

  return { snapshot, status };
}
