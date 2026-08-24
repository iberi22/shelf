import { Laptop } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { localAuthManager } from '../lib/localAuth';
import CollapsibleCard from './CollapsibleCard';

const DeviceManagementPanel: React.FC = () => {
  const { getAuthorizedDevices, revokeDevice, isLocalAccount } = useAuth();
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');

  if (!isLocalAccount) return null;

  const devices = getAuthorizedDevices();
  const currentDevice = localAuthManager.getCurrentDevice();

  const handleRevoke = (deviceId: string) => {
    revokeDevice(deviceId);
    setConfirmRevoke(null);
  };

  const handleSaveDeviceName = () => {
    if (newDeviceName.trim()) {
      localAuthManager.updateDeviceName(newDeviceName.trim());
      setEditingName(false);
      setNewDeviceName('');
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <CollapsibleCard
      title="Authorized Devices"
      description="Devices that have access to your local account. Revoke access to devices you no longer use."
      icon={<Laptop className="h-5 w-5" />}
      testId="settings-devices-card"
    >
      <div className="space-y-3">
        {devices.length === 0 && <p className="text-foreground/40 text-sm italic">No devices registered.</p>}

        {devices.map((device) => {
          const isCurrent = device.deviceId === currentDevice.deviceId;
          return (
            <div
              key={device.deviceId}
              className={`flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between ${
                isCurrent ? 'border-foreground/30 bg-foreground/5' : 'border-foreground/10 bg-surface'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{device.deviceName}</span>
                  {isCurrent && (
                    <span className="text-xs bg-foreground/20 text-foreground/70 px-1.5 py-0.5 rounded shrink-0">
                      This device
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/40 font-mono truncate">{device.peerId || 'No peer ID yet'}</p>
                <p className="text-xs text-foreground/30 mt-0.5">
                  Authorized {formatDate(device.authorizedAt)} · Last seen {formatDate(device.lastSeen)}
                </p>
              </div>

              {!isCurrent && (
                <div className="shrink-0 sm:ml-3">
                  {confirmRevoke === device.deviceId ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(null)}
                        className="text-xs text-foreground/50 hover:text-foreground px-2 py-1 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(device.deviceId)}
                        className="text-xs bg-red-900/40 border border-red-600/50 text-red-300 px-2 py-1 rounded hover:bg-red-900/60 transition-colors cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(device.deviceId)}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              )}

              {isCurrent && (
                <div className="shrink-0 sm:ml-3">
                  {editingName ? (
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
                      <input
                        type="text"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        className="w-full min-w-0 rounded border border-foreground/30 bg-surface p-1 text-xs text-foreground sm:w-28"
                        placeholder="Device name"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveDeviceName()}
                      />
                      <button
                        type="button"
                        onClick={handleSaveDeviceName}
                        className="text-xs text-foreground/70 hover:text-foreground cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNewDeviceName(device.deviceName);
                        setEditingName(true);
                      }}
                      className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
                    >
                      Rename
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
};

export default DeviceManagementPanel;
