import type { ReactNode } from 'react';
import { ArrowRight, Box, Database, Radar, Settings2, ShieldCheck, Skull, Users, Zap } from 'lucide-react';
import type { DeploymentInfo, PodInfo } from '../types/cluster-snapshot';
import styles from './TopologyView.module.css';

export interface TopologyViewProps {
  deployments: DeploymentInfo[];
  pods: PodInfo[];
  loadActive?: boolean;
  killedPodName?: string | null;
}

interface NodeConfig {
  label: string;
  description: string;
  icon: ReactNode;
}

const WORKLOAD_ORDER = ['gateway', 'api'];

const NODE_CONFIG: Record<string, NodeConfig> = {
  gateway: {
    label: 'Gateway',
    description: 'Autenticação, rate limit e proxy L7',
    icon: <ShieldCheck size={16} strokeWidth={1.8} />,
  },
  api: {
    label: 'API',
    description: 'Estoque, pedidos e idempotência',
    icon: <Box size={16} strokeWidth={1.8} />,
  },
};

const STATUS_CHIP_CLASS: Record<string, string> = {
  Running: styles.chipGood,
  Pending: styles.chipWarning,
  Terminating: styles.chipCritical,
};

export function TopologyView({ deployments, pods, loadActive = false, killedPodName = null }: TopologyViewProps) {
  const workloadNames = [
    ...WORKLOAD_ORDER.filter((name) => deployments.some((d) => d.name === name)),
    ...deployments
      .map((d) => d.name)
      .filter((name) => name !== 'orchestrator' && !WORKLOAD_ORDER.includes(name)),
  ];

  const orchestratorPods = pods.filter((pod) => pod.app === 'orchestrator');
  const orchestratorDeployment = deployments.find((d) => d.name === 'orchestrator');
  const showControlPlane = orchestratorDeployment !== undefined || orchestratorPods.length > 0;

  const killedApp = killedPodName
    ? deployments.find((d) => killedPodName.startsWith(`${d.name}-`))?.name
    : undefined;

  return (
    <div className={`${styles.clusterFrame} ${loadActive ? styles.clusterFrameActive : ''}`}>
      <div className={styles.clusterHeader}>
        <span className={styles.k8sIcon}>
          <Settings2 size={19} strokeWidth={1.7} />
        </span>
        <div>
          <p className={styles.clusterTitle}>Cluster Kubernetes</p>
          <p className={styles.clusterSubtitle}>Autoscaling, self-healing e balanceamento de carga — ao vivo</p>
        </div>
        <div className={styles.headerBadges}>
          {loadActive && (
            <span className={styles.trafficBadge} data-testid="topology-load-active">
              <Zap size={11} strokeWidth={2.2} fill="currentColor" />
              tráfego ao vivo
            </span>
          )}
          <span className={styles.liveBadge}>
            <span className={styles.liveBadgeDot} />
            ao vivo
          </span>
        </div>
      </div>

      {killedPodName && (
        <div className={styles.killToast} data-testid="topology-kill-toast">
          <Skull size={16} strokeWidth={1.8} />
          <span>
            pod <strong>{killedPodName}</strong> encerrado — Kubernetes recriando
          </span>
        </div>
      )}

      {showControlPlane && (
        <div className={`${styles.controlPlane} ${killedApp === 'orchestrator' ? styles.nodeFlash : ''}`}>
          <span className={styles.radarIcon}>
            <Radar size={20} strokeWidth={1.7} />
          </span>
          <div>
            <p className={styles.controlPlaneLabel}>
              Orchestrator <span className={styles.controlPlaneTag}>control plane</span>
            </p>
            <p className={styles.controlPlaneDescription}>
              Observa pods, CPU e memória de todo o cluster via Kubernetes API e transmite o snapshot por WebSocket
            </p>
          </div>
          <div className={styles.podGrid} aria-label="pods do Orchestrator">
            <PodChips pods={orchestratorPods} />
          </div>
        </div>
      )}

      <p className={styles.dataPlaneLabel}>Data plane — caminho de uma requisição de compra</p>

      <div className={`${styles.flow} ${loadActive ? styles.flowActive : ''}`}>
        <Endpoint icon={<Users size={17} strokeWidth={1.8} />} label="Clientes" pulse={loadActive} />
        <Connector dots={loadActive ? 3 : 1} fast={loadActive} />
        {workloadNames.map((name, index) => (
          <WorkloadNode
            key={name}
            name={name}
            pods={pods.filter((pod) => pod.app === name)}
            deployment={deployments.find((d) => d.name === name)}
            active={loadActive}
            flash={name === killedApp}
            connectorAfter={
              index < workloadNames.length - 1 ? (
                <Connector dots={loadActive ? 4 : 3} label="load balancing" fast={loadActive} />
              ) : undefined
            }
          />
        ))}
        <Connector dots={loadActive ? 3 : 1} fast={loadActive} />
        <Endpoint icon={<Database size={17} strokeWidth={1.8} />} label="Estoque" pulse={loadActive} />
      </div>
    </div>
  );
}

function WorkloadNode({
  name,
  pods,
  deployment,
  connectorAfter,
  active = false,
  flash = false,
}: {
  name: string;
  pods: PodInfo[];
  deployment?: DeploymentInfo;
  connectorAfter?: ReactNode;
  active?: boolean;
  flash?: boolean;
}) {
  const config = NODE_CONFIG[name] ?? { label: name, description: '', icon: <Box size={16} strokeWidth={1.8} /> };
  const classes = [styles.node, active ? styles.nodeActive : '', flash ? styles.nodeFlash : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className={classes} data-testid={`topology-node-${name}`}>
        <div className={styles.nodeHeader}>
          <span className={styles.nodeIcon}>{config.icon}</span>
          <div>
            <p className={styles.nodeLabel}>{config.label}</p>
            {config.description && <p className={styles.nodeDescription}>{config.description}</p>}
          </div>
        </div>
        <CapacityBar deployment={deployment} />
        <div className={styles.podGrid} aria-label={`pods de ${config.label}`}>
          <PodChips pods={pods} />
        </div>
      </div>
      {connectorAfter}
    </>
  );
}

function CapacityBar({ deployment }: { deployment?: DeploymentInfo }) {
  if (!deployment || deployment.replicas === 0) {
    return null;
  }

  const slots = Array.from({ length: deployment.replicas }, (_, index) => index < deployment.readyReplicas);

  return (
    <div className={styles.capacityBar} aria-hidden="true">
      {slots.map((ready, index) => (
        <span
          key={index}
          className={`${styles.capacitySlot} ${ready ? styles.capacitySlotReady : styles.capacitySlotPending}`}
        />
      ))}
    </div>
  );
}

function PodChips({ pods }: { pods: PodInfo[] }) {
  if (pods.length === 0) {
    return <span className={styles.podEmpty} title="Nenhum pod em execução" />;
  }

  return (
    <>
      {pods.map((pod) => {
        const suffix = pod.name.split('-').pop() ?? pod.name;
        return (
          <span
            key={pod.name}
            className={`${styles.podChip} ${STATUS_CHIP_CLASS[pod.status] ?? styles.chipNeutral}`}
            title={`${pod.name} — ${pod.status}`}
          >
            <span className={styles.podChipDot} />
            <span className={styles.podChipLabel}>{suffix}</span>
          </span>
        );
      })}
    </>
  );
}

function Endpoint({ icon, label, pulse = false }: { icon: ReactNode; label: string; pulse?: boolean }) {
  return (
    <div className={styles.endpoint}>
      <span className={`${styles.endpointIcon} ${pulse ? styles.endpointIconPulse : ''}`}>{icon}</span>
      <span className={styles.endpointLabel}>{label}</span>
    </div>
  );
}

function Connector({ label, dots = 1, fast = false }: { label?: string; dots?: number; fast?: boolean }) {
  const duration = fast ? 0.8 : 1.8;
  return (
    <div className={styles.connector}>
      <span className={styles.connectorLabel}>{label}</span>
      <span className={styles.connectorLineRow}>
        <span className={`${styles.connectorLine} ${fast ? styles.connectorLineActive : ''}`}>
          {Array.from({ length: dots }).map((_, index) => (
            <span
              key={index}
              className={styles.flowDot}
              style={{ animationDelay: `${index * (duration / dots)}s`, animationDuration: `${duration}s` }}
            />
          ))}
        </span>
        <ArrowRight className={styles.arrow} size={14} strokeWidth={2} />
      </span>
    </div>
  );
}
