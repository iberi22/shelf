import type React from 'react';
import { useAppContext } from '../context/AppContext';

const AuditLogViewer: React.FC = () => {
  const { state } = useAppContext();

  return (
    <div className="bg-[#1a1a1a] border border-[#F5F5DC]/30 p-4 md:p-6 rounded-lg mt-6">
      <h3 className="text-xl font-bold text-[#F5F5DC] mb-4">Audit Logs</h3>
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <table className="w-full text-left text-xs md:text-sm min-w-[400px]">
          <thead className="bg-[#F5F5DC]/10">
            <tr>
              <th className="p-2">Timestamp</th>
              <th className="p-2">Peer ID</th>
              <th className="p-2">Action</th>
              <th className="p-2">Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {state.auditLogs.length > 0 ? (
              state.auditLogs.map((log) => (
                <tr key={log.id} className="border-t border-[#F5F5DC]/10 hover:bg-foreground/5">
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
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="text-center p-4 text-[#F5F5DC]/50 italic">
                  No logs available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLogViewer;
