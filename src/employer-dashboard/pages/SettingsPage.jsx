import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import SettingsMobile from '../mobile/SettingsMobile';

const SettingsDesktop = lazy(() => import('../desktop/SettingsDesktop'));

export default function SettingsPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <SettingsMobile />;
  return (
    <Suspense fallback={<PageFallback />}>
      <SettingsDesktop />
    </Suspense>
  );
}
