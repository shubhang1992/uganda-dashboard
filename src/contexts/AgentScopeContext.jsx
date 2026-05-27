import { createContext, useContext, useMemo } from 'react';

// Provides an agent ID to descendants when the dashboard is rendered for an
// Agent. Other dashboards do not wrap with this provider, so consumers reading
// `useAgentScope().agentId` outside of the agent tree will see null.
const AgentScopeContext = createContext({ agentId: null });

export function AgentScopeProvider({ agentId, children }) {
  const value = useMemo(() => ({ agentId: agentId || null }), [agentId]);

  return (
    <AgentScopeContext value={value}>
      {children}
    </AgentScopeContext>
  );
}

export function useAgentScope() {
  return useContext(AgentScopeContext);
}
