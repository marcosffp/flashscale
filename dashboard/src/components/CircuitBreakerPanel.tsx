import { ShieldCheck } from 'lucide-react';
import { useCircuitBreakerStatus } from '../hooks/use-circuit-breaker-status';
import styles from './CircuitBreakerPanel.module.css';

export interface CircuitBreakerPanelProps {
  gatewayUrl: string;
}

const ROTULOS: Record<string, string> = {
  fechado: 'Fechado',
  aberto: 'Aberto',
  'meio-aberto': 'Meio-aberto',
  desconhecido: 'Verificando…',
};

export function CircuitBreakerPanel({ gatewayUrl }: CircuitBreakerPanelProps) {
  const state = useCircuitBreakerStatus(gatewayUrl);

  return (
    <div className={styles.panel}>
      <span className={styles.icon} aria-hidden="true">
        <ShieldCheck size={16} strokeWidth={1.8} />
      </span>
      <span className={styles.label}>Circuit breaker</span>
      <span
        className={`${styles.badge} ${styles[cssClasseParaEstado(state)]}`}
        data-testid="circuit-breaker-estado"
      >
        <span className={styles.badgeDot} />
        {ROTULOS[state]}
      </span>
    </div>
  );
}

function cssClasseParaEstado(state: string): string {
  switch (state) {
    case 'fechado':
      return 'estadoFechado';
    case 'aberto':
      return 'estadoAberto';
    case 'meio-aberto':
      return 'estadoMeioAberto';
    default:
      return 'estadoDesconhecido';
  }
}
