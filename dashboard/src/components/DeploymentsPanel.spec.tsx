import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeploymentsPanel } from './DeploymentsPanel';
import type { DeploymentInfo } from '../types/cluster-snapshot';

describe('DeploymentsPanel', () => {
  it('mostra o nome e a proporção réplicas prontas/desejadas de cada deployment', () => {
    const deployments: DeploymentInfo[] = [
      { name: 'gateway', replicas: 2, readyReplicas: 2 },
      { name: 'api', replicas: 5, readyReplicas: 3 },
    ];

    render(<DeploymentsPanel deployments={deployments} />);

    expect(screen.getByText('gateway')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });

  it('marca como "escalando" um deployment com réplicas prontas abaixo do desejado', () => {
    const deployments: DeploymentInfo[] = [{ name: 'api', replicas: 5, readyReplicas: 3 }];

    render(<DeploymentsPanel deployments={deployments} />);

    expect(screen.getByTestId('deployment-status-api')).toHaveTextContent('escalando');
  });

  it('marca como "estável" um deployment com todas as réplicas prontas', () => {
    const deployments: DeploymentInfo[] = [{ name: 'gateway', replicas: 2, readyReplicas: 2 }];

    render(<DeploymentsPanel deployments={deployments} />);

    expect(screen.getByTestId('deployment-status-gateway')).toHaveTextContent('estável');
  });

  it('mostra uma mensagem quando ainda não há nenhum deployment monitorado', () => {
    render(<DeploymentsPanel deployments={[]} />);

    expect(screen.getByText(/nenhum deployment/i)).toBeInTheDocument();
  });
});
