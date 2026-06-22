import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import HomeDesktop from './HomeDesktop';
import HomeMobile from './HomeMobile';

export default function HomePage() {
  const { agentId } = useAgentScope();

  const isDesktop = useIsDesktop();
  if (isDesktop) return <HomeDesktop />;

  return <HomeMobile agentId={agentId} />;
}
