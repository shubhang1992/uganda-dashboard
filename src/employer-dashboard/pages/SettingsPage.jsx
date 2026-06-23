import { lazy, Suspense } from 'react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import PageFallback from '../shell/PageFallback';
import MobilePlaceholder from '../shell/MobilePlaceholder';

const SettingsDesktop = lazy(() => import('../desktop/SettingsDesktop'));

export default function SettingsPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobilePlaceholder name="Settings" />;
  return (
    <Suspense fallback={<PageFallback />}>
      <SettingsDesktop />
    </Suspense>
  );
}
