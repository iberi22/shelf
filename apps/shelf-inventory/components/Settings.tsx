import type React from 'react';
import { useI18n } from '../context/I18nContext';
import BranchConfig from './BranchConfig';
import NetworkConfig from './NetworkConfig';
import P2PMeshLogic from './P2PMeshLogic';
import P2PSyncManager from './P2PSyncManager';

const Settings: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="pb-10">
      <h2 className="text-2xl md:text-3xl font-bold mb-6">{t('settings.title')}</h2>

      <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8 [&>*]:w-full [&>*]:min-w-0 [&>*]:max-w-full">
        <NetworkConfig />
        <BranchConfig />
        <P2PSyncManager />
        <P2PMeshLogic />
      </div>
    </div>
  );
};

export default Settings;
