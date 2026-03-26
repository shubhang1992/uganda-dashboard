import { DashboardProvider } from '../contexts/DashboardContext';
import Sidebar from './sidebar/Sidebar';
import UgandaMap from './map/UgandaMap';
import OverlayPanel from './overlay/OverlayPanel';
import Breadcrumb from './overlay/Breadcrumb';
import MetricsRow from './cards/MetricsRow';
import TopBar from './overlay/TopBar';
import ChatPanel from './chat/ChatPanel';
import styles from './DashboardShell.module.css';

export default function DashboardShell() {
  return (
    <DashboardProvider>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.main}>
          <UgandaMap />
          <Breadcrumb />
          <OverlayPanel />
          <TopBar />
          <MetricsRow />
          <ChatPanel />
        </div>
      </div>
    </DashboardProvider>
  );
}
