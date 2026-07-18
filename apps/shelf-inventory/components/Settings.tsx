import { RadioTower, Sliders } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import AuditLogViewer from './AuditLogViewer';
import BranchConfig from './BranchConfig';
import CollapsibleCard from './CollapsibleCard';
import DataRecovery from './DataRecovery';
import DeviceManagementPanel from './DeviceManagementPanel';
import FeatureFlagsPanel from './FeatureFlagsPanel';
import NetworkConfig from './NetworkConfig';
import P2PMeshLogic from './P2PMeshLogic';
import P2PSyncManager from './P2PSyncManager';

const Settings: React.FC = () => {
  const { t } = useI18n();
  const { state } = useAppContext();
  const { user } = useAuth();
  const { metadata: featuresMetadata } = useFeatureFlags();

  const team = useMemo(
    () => [{ id: 'owner', email: user?.email ?? 'owner@example.com', role: 'owner' as const }, ...state.teamMembers],
    [user?.email, state.teamMembers],
  );

  const isAdmin = state.role === 'admin' || team.find((m) => m.email === user?.email)?.role === 'owner';

  return (
    <div className="pb-10">
      <h2 className="text-2xl md:text-3xl font-bold mb-6">{t('settings.title')}</h2>

      <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8 [&>*]:w-full [&>*]:min-w-0 [&>*]:max-w-full">
        {/* User-facing Settings (internally collapsible) */}
        <NetworkConfig />
        <BranchConfig />

        {/* Unified Advanced System, P2P, and Development Panel */}
        <CollapsibleCard
          title="Configuración de Red, P2P y Sistema"
          description={`Red descentralizada P2P, gobernanza, dispositivos vinculados, logs de auditoría y características avanzadas. Avance del desarrollo: ${featuresMetadata?.implementation_percentage || 0}%`}
          icon={<RadioTower className="h-6 w-6 text-[#4ADE80]" />}
          testId="settings-system-advanced-card"
          className="border-dashed border-[#F5F5DC]/40"
        >
          <div className="flex w-full flex-col gap-6 md:gap-8 mt-4">
            <P2PSyncManager />
            <P2PMeshLogic />
            <DeviceManagementPanel />
            <DataRecovery />
            {isAdmin && <AuditLogViewer />}

            <CollapsibleCard
              title="Control de Funcionalidades (GitCore)"
              description="Activa y desactiva características del monorepo en tiempo de ejecución."
              icon={<Sliders className="h-5 w-5" />}
              testId="settings-feature-flags-card"
            >
              <FeatureFlagsPanel />
            </CollapsibleCard>
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
};

export default Settings;
