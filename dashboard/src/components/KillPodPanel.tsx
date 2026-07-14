import { useState } from 'react';
import { AlertTriangle, CircleCheck, Loader2, Skull } from 'lucide-react';
import styles from './KillPodPanel.module.css';

export interface KillPodPanelProps {
  orchestratorHttpUrl: string;
  onPodKilled?: (podName: string) => void;
}

type Resultado = { tipo: 'sucesso'; podName: string } | { tipo: 'erro'; mensagem: string } | null;

export function KillPodPanel({ orchestratorHttpUrl, onPodKilled }: KillPodPanelProps) {
  const [matando, setMatando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);

  async function matar(): Promise<void> {
    setMatando(true);
    setResultado(null);

    try {
      const res = await fetch(`${orchestratorHttpUrl}/pods/kill`, { method: 'POST' });
      const body = (await res.json()) as { podName?: string; message?: string };

      if (res.ok && body.podName) {
        setResultado({ tipo: 'sucesso', podName: body.podName });
        onPodKilled?.(body.podName);
      } else {
        setResultado({ tipo: 'erro', mensagem: body.message ?? 'Falha ao matar o pod' });
      }
    } catch {
      setResultado({ tipo: 'erro', mensagem: 'Falha ao matar o pod' });
    } finally {
      setMatando(false);
    }
  }

  return (
    <div className={styles.panel}>
      <button className={styles.botao} onClick={matar} disabled={matando}>
        <span className={styles.botaoIcon} aria-hidden="true">
          {matando ? <Loader2 size={15} strokeWidth={2.4} /> : <Skull size={15} strokeWidth={2} />}
        </span>
        {matando ? 'Matando pod…' : 'Matar pod aleatório'}
      </button>

      {resultado?.tipo === 'sucesso' && (
        <span className={styles.sucesso} data-testid="kill-pod-resultado">
          <CircleCheck size={15} strokeWidth={2} />
          Pod {resultado.podName} matado — aguardando o Kubernetes recriar.
        </span>
      )}

      {resultado?.tipo === 'erro' && (
        <span className={styles.erro} role="alert">
          <AlertTriangle size={15} strokeWidth={2} />
          {resultado.mensagem}
        </span>
      )}
    </div>
  );
}
