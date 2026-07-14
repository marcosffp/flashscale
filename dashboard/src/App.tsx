import { useRef, useState } from 'react';
import { Boxes, Layers, Zap } from 'lucide-react';
import { CircuitBreakerPanel } from './components/CircuitBreakerPanel';
import { DeploymentsPanel } from './components/DeploymentsPanel';
import { KillPodPanel } from './components/KillPodPanel';
import { LoadTestPanel } from './components/LoadTestPanel';
import { PodsList } from './components/PodsList';
import { TopologyView } from './components/TopologyView';
import { useClusterSnapshot } from './hooks/use-cluster-snapshot';
import styles from './App.module.css';

const KILL_FLASH_DURATION_MS = 2600;

const ORCHESTRATOR_WS_URL =
  (import.meta.env.VITE_ORCHESTRATOR_WS_URL as string | undefined) ?? 'ws://localhost:3002';
const ORCHESTRATOR_HTTP_URL =
  (import.meta.env.VITE_ORCHESTRATOR_HTTP_URL as string | undefined) ?? 'http://localhost:3002';
const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'http://localhost:3000';
// Produto semeado pela migration SeedProdutoCarga1700000000002 (Etapa 7) —
// precisa existir no banco pra POST /pedidos não falhar por violação de FK.
const PRODUTO_CARGA_ID =
  (import.meta.env.VITE_PRODUTO_CARGA_ID as string | undefined) ?? '11111111-1111-4111-8111-111111111111';

export function App() {
  const { snapshot, status } = useClusterSnapshot(ORCHESTRATOR_WS_URL);
  const [loadActive, setLoadActive] = useState(false);
  const [killedPodName, setKilledPodName] = useState<string | null>(null);
  const killFlashTimer = useRef<ReturnType<typeof setTimeout>>();

  function reportPodKilled(podName: string): void {
    clearTimeout(killFlashTimer.current);
    setKilledPodName(null);
    // Força o CSS a reiniciar a animação mesmo se o mesmo pod for o alvo de novo.
    requestAnimationFrame(() => setKilledPodName(podName));
    killFlashTimer.current = setTimeout(() => setKilledPodName(null), KILL_FLASH_DURATION_MS);
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.logoMark} aria-hidden="true">
            <Zap size={20} strokeWidth={2.2} fill="currentColor" />
          </span>
          <div>
            <h1 className={styles.title}>Flash Sale — Painel do Cluster</h1>
            <div className={styles.titleMeta}>
              <span className={`${styles.liveDot} ${styles[liveDotClass(status)]}`} aria-hidden="true" />
              {statusLabel(status)}
            </div>
          </div>
        </div>
        {snapshot && (
          <span className={styles.timestamp}>
            Última atualização: {new Date(snapshot.timestamp).toLocaleTimeString('pt-BR')}
          </span>
        )}
      </header>

      {status === 'fechada' && (
        <div className={styles.banner} role="alert">
          Conexão perdida com o orchestrator — tentando reconectar...
        </div>
      )}

      <div className={styles.toolbar}>
        <LoadTestPanel gatewayUrl={GATEWAY_URL} produtoId={PRODUTO_CARGA_ID} onActivityChange={setLoadActive} />
        <KillPodPanel orchestratorHttpUrl={ORCHESTRATOR_HTTP_URL} onPodKilled={reportPodKilled} />
        <CircuitBreakerPanel gatewayUrl={GATEWAY_URL} />
      </div>

      {!snapshot ? (
        <p className={styles.waiting}>Aguardando o primeiro snapshot do cluster...</p>
      ) : (
        <>
          <TopologyView
            deployments={snapshot.deployments}
            pods={snapshot.pods}
            loadActive={loadActive}
            killedPodName={killedPodName}
          />

          <div className={styles.grid}>
            <section>
              <h2 className={styles.sectionTitle}>
                <Boxes size={13} strokeWidth={2} />
                Deployments
              </h2>
              <DeploymentsPanel deployments={snapshot.deployments} />
            </section>
            <section>
              <h2 className={styles.sectionTitle}>
                <Layers size={13} strokeWidth={2} />
                Pods
              </h2>
              <PodsList pods={snapshot.pods} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function liveDotClass(status: string): string {
  switch (status) {
    case 'aberta':
      return 'liveDotAberta';
    case 'fechada':
      return 'liveDotFechada';
    default:
      return 'liveDotConectando';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'aberta':
      return 'conectado ao orchestrator';
    case 'fechada':
      return 'desconectado';
    default:
      return 'conectando…';
  }
}
