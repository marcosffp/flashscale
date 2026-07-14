import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { dispatchLoad, type DispatchLoadCounts } from '../load/load-dispatcher';
import styles from './LoadTestPanel.module.css';

export interface LoadTestPanelProps {
  gatewayUrl: string;
  produtoId: string;
  totalRequisicoes?: number;
  concorrencia?: number;
  onActivityChange?: (ativo: boolean) => void;
}

const CONTAGEM_INICIAL: DispatchLoadCounts = { enviados: 0, confirmados: 0, rejeitados: 0, erros: 0 };

export function LoadTestPanel({
  gatewayUrl,
  produtoId,
  totalRequisicoes = 200,
  concorrencia = 20,
  onActivityChange,
}: LoadTestPanelProps) {
  const [disparando, setDisparando] = useState(false);
  const [contagem, setContagem] = useState<DispatchLoadCounts>(CONTAGEM_INICIAL);

  async function disparar(): Promise<void> {
    setDisparando(true);
    setContagem(CONTAGEM_INICIAL);
    onActivityChange?.(true);

    const resultado = await dispatchLoad(
      { gatewayUrl, produtoId, totalRequisicoes, concorrencia },
      (progresso) => setContagem(progresso),
    );

    setContagem(resultado);
    setDisparando(false);
    onActivityChange?.(false);
  }

  return (
    <div className={`${styles.panel} ${disparando ? styles.panelActive : ''}`}>
      <button className={styles.botao} onClick={disparar} disabled={disparando}>
        <span className={styles.botaoIcon} aria-hidden="true">
          {disparando ? <Loader2 size={15} strokeWidth={2.4} /> : <Zap size={15} strokeWidth={2.2} fill="currentColor" />}
        </span>
        {disparando ? 'Disparando carga…' : 'Disparar carga'}
      </button>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {contagem.enviados}
            <span className={styles.statValueTotal}>/{totalRequisicoes}</span>
          </span>
          <span className={styles.statLabel}>enviados</span>
        </div>
        <div
          className={`${styles.stat} ${styles.statGood}`}
          data-testid="load-confirmados"
          aria-label={`${contagem.confirmados} confirmados`}
        >
          <span className={styles.statValue}>{contagem.confirmados}</span>
          <span className={styles.statLabel}>confirmados</span>
        </div>
        <div
          className={`${styles.stat} ${styles.statWarning}`}
          data-testid="load-rejeitados"
          aria-label={`${contagem.rejeitados} rejeitados`}
        >
          <span className={styles.statValue}>{contagem.rejeitados}</span>
          <span className={styles.statLabel}>rejeitados</span>
        </div>
        <div
          className={`${styles.stat} ${styles.statCritical}`}
          data-testid="load-erros"
          aria-label={`${contagem.erros} erros`}
        >
          <span className={styles.statValue}>{contagem.erros}</span>
          <span className={styles.statLabel}>erros</span>
        </div>
      </div>
    </div>
  );
}
