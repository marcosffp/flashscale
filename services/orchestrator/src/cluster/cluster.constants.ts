// Deployments acompanhados pelo painel em tempo real (negocio.md §8).
export const MONITORED_APPS = ['gateway', 'api', 'orchestrator'] as const;

// O único app que o botão "matar pod" pode atingir. O RBAC do orchestrator
// concede delete sobre qualquer pod do namespace (k8s não filtra por label
// nativamente) — este filtro em código é o que garante, na prática, que
// postgres/gateway nunca sejam derrubados (negocio.md §5.1, risco residual
// documentado).
export const KILLABLE_APP_LABEL = 'api';

export const KUBE_CONFIG = Symbol('KUBE_CONFIG');
export const CORE_V1_API = Symbol('CORE_V1_API');
export const APPS_V1_API = Symbol('APPS_V1_API');
export const METRICS_CLIENT = Symbol('METRICS_CLIENT');
