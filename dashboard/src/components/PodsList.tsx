import type { PodInfo } from '../types/cluster-snapshot';
import styles from './PodsList.module.css';

export interface PodsListProps {
  pods: PodInfo[];
}

const STATUS_CLASS: Record<string, string> = {
  Running: styles.statusRunning,
  Pending: styles.statusPending,
  Terminating: styles.statusTerminating,
};

export function PodsList({ pods }: PodsListProps) {
  if (pods.length === 0) {
    return <p className={styles.empty}>Nenhum pod encontrado.</p>;
  }

  return (
    <div className={styles.panel}>
      <table>
        <thead>
          <tr>
            <th>Pod</th>
            <th>App</th>
            <th>Status</th>
            <th>CPU</th>
            <th>Memória</th>
          </tr>
        </thead>
        <tbody>
          {pods.map((pod) => (
            <tr key={pod.name}>
              <td>{pod.name}</td>
              <td>{pod.app}</td>
              <td>
                <span
                  className={`${styles.status} ${STATUS_CLASS[pod.status] ?? styles.statusOutro}`}
                  data-testid={`pod-status-${pod.name}`}
                >
                  <span className={styles.statusDot} />
                  {pod.status}
                </span>
              </td>
              <td>{pod.cpuMillis !== null ? `${pod.cpuMillis}m` : '—'}</td>
              <td>{pod.memoryMebibytes !== null ? `${pod.memoryMebibytes}Mi` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
