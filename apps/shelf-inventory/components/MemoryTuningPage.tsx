import { Activity, Brain, CheckCircle2, Cpu, History, Play, RefreshCw, Zap } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import {
  AVAILABLE_EXERCISES,
  type ExerciseResult,
  loadTuningHistoryFromXavier,
  runCompressionExercise,
  runFullTuningSession,
  runIndexingExercise,
  runPruningExercise,
  type TuningSession,
} from '../lib/memoryTuning';
import { probeXavierConnection, type XavierConnectionStatus } from '../lib/xavier';

const MemoryTuningPage: React.FC = () => {
  const { t } = useI18n();
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingExerciseId, setExecutingExerciseId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<TuningSession | null>(null);
  const [history, setHistory] = useState<TuningSession[]>([]);
  const [xavierStatus, setXavierStatus] = useState<XavierConnectionStatus>('unknown');
  const [activeTab, setActiveTab] = useState<'exercises' | 'history'>('exercises');

  const loadHistory = useCallback(async () => {
    const sessions = await loadTuningHistoryFromXavier();
    setHistory(sessions);
  }, []);

  useEffect(() => {
    void loadHistory();
    void probeXavierConnection().then(setXavierStatus);
  }, [loadHistory]);

  const handleRunAll = async () => {
    setIsExecuting(true);
    setExecutingExerciseId(null);
    try {
      const session = await runFullTuningSession();
      setCurrentSession(session);
      await loadHistory();
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRunSingle = async (exerciseId: string, type: 'compression' | 'indexing' | 'pruning') => {
    setIsExecuting(true);
    setExecutingExerciseId(exerciseId);
    try {
      let result: ExerciseResult;
      if (type === 'compression') result = await runCompressionExercise();
      else if (type === 'indexing') result = await runIndexingExercise();
      else result = await runPruningExercise();

      const newSession: TuningSession = {
        id: `single-${Date.now()}`,
        timestamp: new Date().toISOString(),
        totalScore: result.score,
        averageEfficiencyGain: result.efficiencyGainPct,
        results: [result],
      };
      setCurrentSession(newSession);
      await loadHistory();
    } finally {
      setIsExecuting(false);
      setExecutingExerciseId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-2 sm:p-4">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface p-6 rounded-2xl border border-white/10 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Brain className="w-7 h-7 text-accent-green" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('nav.memoryTuning') || 'Memory Tuning & Optimization'}
            </h1>
          </div>
          <p className="text-sm text-foreground/70">
            {t('memoryTuning.subtitle') ||
              'Ajuste y optimización de memoria agentica Xavier para maximizar eficiencia y velocidad de búsqueda local.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-alt border border-white/10 text-xs font-medium">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                xavierStatus === 'connected' ? 'bg-accent-green' : 'bg-yellow-500'
              }`}
            />
            <span className="text-foreground/80">
              Xavier: {xavierStatus === 'connected' ? 'Conectado' : 'Modo Offline / Fallback'}
            </span>
          </div>

          <button
            onClick={handleRunAll}
            disabled={isExecuting}
            data-testid="run-all-tuning-btn"
            className="flex items-center gap-2 px-5 py-2.5 bg-accent-green text-background font-bold rounded-xl hover:bg-accent-green/90 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-accent-green/10"
          >
            {isExecuting && !executingExerciseId ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span>{isExecuting ? 'Ejecutando...' : 'Ejecutar Todo'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 space-x-4">
        <button
          onClick={() => setActiveTab('exercises')}
          className={`pb-3 px-2 text-sm font-semibold transition-colors relative ${
            activeTab === 'exercises' ? 'text-accent-green' : 'text-foreground/60 hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <span>Ejercicios ({AVAILABLE_EXERCISES.length})</span>
          </div>
          {activeTab === 'exercises' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-green" />}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 px-2 text-sm font-semibold transition-colors relative ${
            activeTab === 'history' ? 'text-accent-green' : 'text-foreground/60 hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            <span>Historial en Xavier ({history.length})</span>
          </div>
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-green" />}
        </button>
      </div>

      {activeTab === 'exercises' && (
        <div className="space-y-6">
          {/* Latest Session Metrics Summary Card */}
          {currentSession && (
            <div className="bg-surface-alt/60 p-6 rounded-2xl border border-accent-green/30 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-accent-green" />
                  <div>
                    <h3 className="font-bold text-lg text-foreground">Resultado de la Última Sesión</h3>
                    <p className="text-xs text-foreground/50">{new Date(currentSession.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-right">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-foreground/50 font-bold block">Puntaje</span>
                    <span className="text-2xl font-black text-accent-green">{currentSession.totalScore} / 100</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wider text-foreground/50 font-bold block">
                      Eficiencia Ganada
                    </span>
                    <span className="text-2xl font-black text-accent-green">
                      +{currentSession.averageEfficiencyGain}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Individual breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {currentSession.results.map((res) => (
                  <div key={res.exerciseId} className="bg-background/50 p-4 rounded-xl border border-white/5 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-accent-green uppercase">{res.type}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent-green/10 text-accent-green">
                        {res.score} pts
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-foreground">{res.exerciseTitle}</h4>
                    <p className="text-xs text-foreground/70">{res.details}</p>
                    <div className="flex justify-between text-[11px] text-foreground/50 font-mono pt-1">
                      <span>Ganancia: +{res.efficiencyGainPct}%</span>
                      <span>Tiempo: {res.executionTimeMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Exercises Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AVAILABLE_EXERCISES.map((ex) => {
              const isRunningThis = isExecuting && executingExerciseId === ex.id;
              return (
                <div
                  key={ex.id}
                  className="bg-surface p-6 rounded-2xl border border-white/10 flex flex-col justify-between hover:border-accent-green/40 transition-all shadow-md hover:shadow-lg"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-green/10 flex items-center justify-center text-accent-green">
                      {ex.type === 'compression' ? (
                        <Cpu className="w-5 h-5" />
                      ) : ex.type === 'indexing' ? (
                        <Activity className="w-5 h-5" />
                      ) : (
                        <Zap className="w-5 h-5" />
                      )}
                    </div>
                    <h3 className="font-bold text-lg text-foreground">{ex.title}</h3>
                    <p className="text-xs text-foreground/70 leading-relaxed">{ex.description}</p>
                    <div className="text-xs text-foreground/50 font-mono">
                      Meta de Eficiencia: &ge; {ex.targetEfficiency}%
                    </div>
                  </div>

                  <div className="pt-6 mt-4 border-t border-white/5">
                    <button
                      onClick={() => handleRunSingle(ex.id, ex.type)}
                      disabled={isExecuting}
                      data-testid={`run-exercise-${ex.id}`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-surface-alt hover:bg-accent-green hover:text-background font-semibold text-xs rounded-xl transition-all border border-white/10 active:scale-95 disabled:opacity-50"
                    >
                      {isRunningThis ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>{isRunningThis ? 'Optimizando...' : 'Ejecutar Ejercicio'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-surface p-6 rounded-2xl border border-white/10 shadow-lg space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-white/10">
            <div>
              <h3 className="font-bold text-lg text-foreground">Historial de Calibración Guardado en Xavier</h3>
              <p className="text-xs text-foreground/60">
                Registros persistidos en el namespace de memoria agentica del dispositivo.
              </p>
            </div>
            <button
              onClick={loadHistory}
              className="p-2 text-foreground/60 hover:text-foreground rounded-lg hover:bg-white/5"
              title="Recargar historial"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-foreground/50 space-y-2">
              <History className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-sm">No hay registros de ajuste en Xavier memory aún.</p>
              <p className="text-xs text-foreground/40">Ejecuta los ejercicios para generar métricas de rendimiento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((session) => (
                <div
                  key={session.id}
                  className="p-4 rounded-xl bg-surface-alt/40 border border-white/5 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-accent-green">{session.id}</span>
                      <span className="text-xs text-foreground/50">
                        • {new Date(session.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/70">{session.results.length} ejercicio(s) ejecutado(s)</p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-foreground/40 block font-bold">Puntaje</span>
                      <span className="font-bold text-foreground text-sm">{session.totalScore} / 100</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-foreground/40 block font-bold">Eficiencia</span>
                      <span className="font-bold text-accent-green text-sm">+{session.averageEfficiencyGain}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoryTuningPage;
