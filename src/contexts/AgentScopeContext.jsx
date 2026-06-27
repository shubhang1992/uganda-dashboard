import { createScopeContext } from './createScopeContext';

// Provides an agent ID to descendants when the dashboard is rendered for an
// Agent. Other dashboards do not wrap with this provider, so consumers reading
// `useAgentScope().agentId` outside of the agent tree will see null.
const { ScopeProvider, useScope } = createScopeContext('agentId');

export const AgentScopeProvider = ScopeProvider;
export const useAgentScope = useScope;
