import { Box, Radar, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { DeploymentInfo } from '../types/cluster-snapshot';
import styles from './DeploymentsPanel.module.css';

export interface DeploymentsPanelProps {
  deployments: DeploymentInfo[];
}

const ICONS: Record<string, LucideIcon> = {
  gateway: ShieldCheck,
  api: Box,
  orchestrator: Radar,
};

export function DeploymentsPanel({ deployments }: DeploymentsPanelProps) {
  if (deployments.length === 0) {
    return <p className={styles.empty}>Nenhum deployment monitorado ainda.</p>;
  }

  return (
    <div className={styles.panel}>
      {deployments.map((deployment) => {
        const estavel = deployment.readyReplicas >= deployment.replicas;
        const Icon = ICONS[deployment.name] ?? Box;
        return (
          <div className={styles.row} key={deployment.name}>
            <span className={styles.iconBadge} aria-hidden="true">
              <Icon size={15} strokeWidth={1.8} />
            </span>
            <span className={styles.name}>{deployment.name}</span>
            <span className={styles.replicas}>
              {deployment.readyReplicas}/{deployment.replicas}
            </span>
            <span
              className={`${styles.status} ${estavel ? styles.statusEstavel : styles.statusEscalando}`}
              data-testid={`deployment-status-${deployment.name}`}
            >
              <span className={styles.statusDot} />
              {estavel ? 'estável' : 'escalando'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
