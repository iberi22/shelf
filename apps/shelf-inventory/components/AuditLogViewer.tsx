import { History } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import CollapsibleCard from './CollapsibleCard';

const LogDetails: React.FC<{ details: any; action: string }> = ({ details, action }) => {
  if (!details) return <span className="text-foreground/40 italic text-xs">-</span>;

  if (details.diff) {
    const keys = Object.keys(details.diff);
    if (keys.length === 0) return <span className="text-foreground/40 italic text-xs">No changes detected</span>;
    return (
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
        {keys.map((key) => {
          let oldVal = details.diff[key].old;
          let newVal = details.diff[key].new;
          if (typeof oldVal === 'object') oldVal = JSON.stringify(oldVal);
          if (typeof newVal === 'object') newVal = JSON.stringify(newVal);

          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono bg-black/20 p-1 rounded"
            >
              <span className="font-bold text-foreground/80">{key}:</span>
              <span className="text-red-400/90 line-through truncate max-w-[100px]" title={String(oldVal)}>
                {String(oldVal)}
              </span>
              <span className="text-foreground/50">→</span>
              <span className="text-green-400/90 truncate max-w-[100px]" title={String(newVal)}>
                {String(newVal)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (details.payload) {
    const isDelete = action.includes('DELETE');
    const isAdd = action.includes('ADD');

    if (action === 'BATCH_UPDATE_PRODUCTS') {
      const toAdd = details.payload.toAdd?.length || 0;
      const toUpdate = details.payload.toUpdate?.length || 0;
      return (
        <span className="text-xs text-blue-400/80 font-mono">
          Added: {toAdd}, Updated: {toUpdate}
        </span>
      );
    }

    if (typeof details.payload === 'object' && !Array.isArray(details.payload)) {
      const displayKey = details.payload.name || details.payload.id || 'Item';
      return (
        <span
          className={`text-xs font-mono ${isDelete ? 'text-red-400/80' : isAdd ? 'text-green-400/80' : 'text-blue-400/80'}`}
        >
          {isDelete ? 'Deleted' : isAdd ? 'Added' : 'Processed'}: {displayKey}
        </span>
      );
    }

    if (Array.isArray(details.payload)) {
      return <span className="text-xs text-foreground/70">{details.payload.length} items modified</span>;
    }
  }

  return (
    <div className="text-[10px] font-mono text-foreground/60 max-w-[200px] truncate" title={JSON.stringify(details)}>
      {JSON.stringify(details)}
    </div>
  );
};

const AuditLogViewer: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const uniqueActions = useMemo(() => {
    const actions = new Set(state.auditLogs.map((log) => log.action));
    return Array.from(actions).sort();
  }, [state.auditLogs]);

  const filteredLogs = useMemo(() => {
    if (filterAction === 'ALL') return state.auditLogs;
    return state.auditLogs.filter((log) => log.action === filterAction);
  }, [state.auditLogs, filterAction]);

  const handleClearLogs = () => {
    if (window.confirm('¿Estás seguro de que quieres limpiar TODOS los logs? Esta acción no se puede deshacer.')) {
      dispatch({ type: 'CLEAR_AUDIT_LOGS' });
    }
  };

  const handleClearOldLogs = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (window.confirm('¿Limpiar logs de más de 30 días de antigüedad?')) {
      dispatch({ type: 'CLEAR_AUDIT_LOGS', payload: { beforeDate: thirtyDaysAgo.toISOString() } });
    }
  };

  return (
    <CollapsibleCard title="Audit Logs" icon={<History className="h-5 w-5" />} testId="settings-audit-logs-card">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <span className="text-xs text-foreground/60">
          Historial detallado de todas las mutaciones locales y remotas.
        </span>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full sm:w-auto bg-background border border-foreground/20 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-foreground/50"
          >
            <option value="ALL">Todos los eventos ({state.auditLogs.length})</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleClearOldLogs}
              className="flex-1 sm:flex-none text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer"
              title="Recomendado: Limpiar logs de meses anteriores"
            >
              Limpiar &gt; 30 días
            </button>
            <button
              type="button"
              onClick={handleClearLogs}
              className="flex-1 sm:flex-none text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              Limpiar Todo
            </button>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 flex-1 overflow-hidden rounded-md border border-foreground/10 bg-black/10">
        {filteredLogs.length === 0 ? (
          <div className="text-center p-4 text-foreground/50 italic">No logs available.</div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2 custom-scrollbar md:overflow-auto md:p-0">
            <table className="responsive-table w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[180px]" />
                <col className="w-[150px]" />
                <col className="w-[170px]" />
                <col className="w-[280px]" />
              </colgroup>
              <thead className="sticky top-0 bg-surface-alt z-10 shadow-sm">
                <tr>
                  <th className="p-2 text-left font-bold text-foreground border-b border-foreground/10">Timestamp</th>
                  <th className="p-2 text-left font-bold text-foreground border-b border-foreground/10">Peer ID</th>
                  <th className="p-2 text-left font-bold text-foreground border-b border-foreground/10">Action</th>
                  <th className="p-2 text-left font-bold text-foreground border-b border-foreground/10">Entity ID</th>
                  <th className="p-2 text-left font-bold text-foreground border-b border-foreground/10">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, index) => (
                  <tr
                    key={log.id || index}
                    className="border-b border-foreground/5 hover:bg-foreground/5 transition-colors"
                  >
                    <td
                      data-label="Timestamp"
                      className="p-2 text-[10px] md:text-xs font-mono text-foreground/70 md:whitespace-nowrap"
                    >
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td
                      data-label="Peer ID"
                      className="p-2 font-mono text-[10px] md:text-xs text-yellow-400/80 truncate"
                      title={log.peerId}
                    >
                      {log.peerId}
                    </td>
                    <td data-label="Action" className="p-2">
                      <span className="inline-block max-w-full truncate px-2 py-0.5 rounded-full bg-foreground/10 text-[10px] md:text-xs font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td
                      data-label="Entity ID"
                      className="p-2 text-[10px] md:text-xs font-mono text-foreground/60 truncate"
                      title={log.entityId || '-'}
                    >
                      {log.entityId || '-'}
                    </td>
                    <td data-label="Details" className="p-2 align-top">
                      <LogDetails details={log.details} action={log.action} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
};

export default AuditLogViewer;
