import { createContext, useContext } from 'react';

// Provides an agent ID to descendants when the dashboard is rendered for an
// Agent. Other dashboards do not wrap with this provider, so consumers reading
// `useAgentScope().agentId` outside of the agent tree will see null.
const AgentScopeContext = createContext({ agentId: null });

export function AgentScopeProvider({ agentId, children }) {
  return (
    <AgentScopeContext value={{ agentId: agentId || null }}>
      {children}
    </AgentScopeContext>
  );
}

export function useAgentScope() {
  return useContext(AgentScopeContext);
}
