import { useDashboard } from '../../contexts/DashboardContext';

export default function ViewSubscribers() {
  const { viewSubscribersOpen } = useDashboard();
  if (!viewSubscribersOpen) return null;
  return <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, background: '#fff', zIndex: 210, padding: 40 }}>ViewSubscribers stub</div>;
}
