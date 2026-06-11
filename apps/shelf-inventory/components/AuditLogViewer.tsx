import type React from 'react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { InfiniteTable } from './InfiniteTable';

const AuditLogViewer: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const uniqueActions = useMemo(() => {
    const actions = new Set(state.auditLogs.map(log => log.action));
    return Array.from(actions).sort();
  }, [state.auditLogs]);

  const filteredLogs = useMemo(() => {
    if (filterAction === 'ALL') return state.auditLogs;
    return state.auditLogs.filter(log => log.action === filterAction);
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
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6 overflow-hidden flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <h3 className="text-xl font-bold text-[#F5F5DC]">Audit Logs</h3>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full sm:w-auto bg-background border border-[#F5F5DC]/20 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#F5F5DC]/50"
          >
            <option value="ALL">Todos los eventos ({state.auditLogs.length})</option>
            {uniqueActions.map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleClearOldLogs}
              className="flex-1 sm:flex-none text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
              title="Recomendado: Limpiar logs de meses anteriores"
            >
              Limpiar &gt; 30 días
            </button>
            <button
              onClick={handleClearLogs}
              className="flex-1 sm:flex-none text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
            >
              Limpiar Todo
            </button>
          </div>
        </div>
      </div>
      
      <div className="w-full pb-2 flex-1">
        <InfiniteTable
          data={filteredLogs}
          height="400px"
          emptyContent={<div className="text-center p-4 text-[#F5F5DC]/50 italic">No logs available.</div>}
          fixedHeaderContent={() => (
            <tr>
              <th className="p-2">Timestamp</th>
              <th className="p-2">Peer ID</th>
              <th className="p-2">Action</th>
              <th className="p-2">Entity ID</th>
            </tr>
          )}
          itemContent={(_, log) => (
            <>
              <td className="p-2 text-[10px] md:text-xs font-mono text-[#F5F5DC]/70 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td className="p-2 font-mono text-yellow-400/80">{log.peerId}</td>
              <td className="p-2">
                <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-xs font-semibold">
                  {log.action}
                </span>
              </td>
              <td className="p-2 text-xs font-mono text-[#F5F5DC]/60">{log.entityId || '-'}</td>
            </>
          )}
        />
      </div>
    </div>
  );
};

export default AuditLogViewer;
