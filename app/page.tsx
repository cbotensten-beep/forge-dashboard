'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Play, Pause, RefreshCw, Zap, CheckCircle2, 
  XCircle, Clock, AlertTriangle, Settings, SkipForward,
  Loader2, ChevronDown, ChevronUp, Mail, Server
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Feature {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: number;
  status: string;
  error_message?: string;
}

interface Log {
  id: string;
  created_at: string;
  level: string;
  message: string;
}

export default function Dashboard() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [enginePaused, setEnginePaused] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [skipOnError, setSkipOnError] = useState(false);

  const loadData = useCallback(async () => {
    const { data: featuresData } = await supabase
      .from('forge_features').select('*').order('priority');
    if (featuresData) setFeatures(featuresData);

    const { data: logsData } = await supabase
      .from('forge_logs').select('*').order('created_at', { ascending: false }).limit(50);
    if (logsData) setLogs(logsData);

    const { data: configData } = await supabase.from('forge_config').select('key, value');
    if (configData) {
      configData.forEach(row => {
        if (row.key === 'engine_paused') setEnginePaused(row.value === 'true' || row.value === true);
        if (row.key === 'auto_approve') setAutoApprove(row.value === 'true' || row.value === true);
        if (row.key === 'skip_on_error') setSkipOnError(row.value === 'true' || row.value === true);
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const toggleEngine = async () => {
    const newValue = !enginePaused;
    await supabase.from('forge_config').upsert({ key: 'engine_paused', value: String(newValue) });
    setEnginePaused(newValue);
  };

  const skipFeature = async (id: string) => {
    await supabase.from('forge_features').update({ status: 'skipped' }).eq('id', id);
    loadData();
  };

  const retryFeature = async (id: string) => {
    await supabase.from('forge_features').update({ status: 'pending', retry_count: 0, error_message: null }).eq('id', id);
    loadData();
  };

  const markCompleted = async (id: string) => {
    await supabase.from('forge_features').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    loadData();
  };

  const updateConfig = async (key: string, value: boolean) => {
    await supabase.from('forge_config').upsert({ key, value: String(value) });
    if (key === 'auto_approve') setAutoApprove(value);
    if (key === 'skip_on_error') setSkipOnError(value);
  };

  const completed = features.filter(f => f.status === 'completed').length;
  const pending = features.filter(f => f.status === 'pending').length;
  const failed = features.filter(f => f.status === 'failed').length;
  const inProgress = features.filter(f => f.status === 'in_progress').length;
  const skipped = features.filter(f => f.status === 'skipped').length;
  const total = features.length;
  
  const currentFeature = features.find(f => f.status === 'in_progress');
  const isBuilding = inProgress > 0;
  const isRunning = isBuilding || !enginePaused;
  const isPausing = enginePaused && isBuilding;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;

  return (
    <div className="min-h-screen p-4 md:p-8 bg-zinc-950">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg"><Zap className="w-8 h-8 text-amber-500" /></div>
          <div><h1 className="text-2xl font-bold text-white">Forge Engine</h1><p className="text-zinc-400 text-sm">Autonomous Coding System</p></div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            isPausing ? 'bg-amber-500/20 text-amber-400' :
            isRunning ? 'bg-green-500/20 text-green-400' : 
            'bg-zinc-800 text-zinc-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isPausing ? 'bg-amber-500 animate-pulse' :
              isRunning ? 'bg-green-500 animate-pulse' : 
              'bg-zinc-500'
            }`} />
            {isPausing ? 'Pausing...' : isRunning ? 'Running' : 'Paused'}
          </div>
          <button 
            onClick={toggleEngine} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              enginePaused 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-amber-600 hover:bg-amber-700'
            } text-white`}
          >
            {enginePaused ? <><Play className="w-4 h-4" />Start</> : <><Pause className="w-4 h-4" />Pause</>}
          </button>
          <button onClick={loadData} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white"><RefreshCw className="w-5 h-5" /></button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white"><Settings className="w-5 h-5" /></button>
        </div>
      </div>

      {showSettings && (
        <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <h3 className="text-lg font-semibold mb-4 text-white">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
              <div><p className="font-medium text-white">Auto-Approve</p><p className="text-sm text-zinc-400">Skip approval prompts</p></div>
              <button onClick={() => updateConfig('auto_approve', !autoApprove)} className={`w-12 h-6 rounded-full relative ${autoApprove ? 'bg-green-600' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${autoApprove ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
              <div><p className="font-medium text-white">Skip on Error</p><p className="text-sm text-zinc-400">Auto-skip failed features</p></div>
              <button onClick={() => updateConfig('skip_on_error', !skipOnError)} className={`w-12 h-6 rounded-full relative ${skipOnError ? 'bg-green-600' : 'bg-zinc-600'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${skipOnError ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800"><div className="flex items-center gap-2 text-zinc-400 mb-1"><Clock className="w-4 h-4" /><span className="text-sm">Pending</span></div><p className="text-2xl font-bold text-white">{pending}</p></div>
        <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800"><div className="flex items-center gap-2 text-blue-400 mb-1"><Loader2 className="w-4 h-4" /><span className="text-sm">Building</span></div><p className="text-2xl font-bold text-white">{inProgress}</p></div>
        <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800"><div className="flex items-center gap-2 text-green-400 mb-1"><CheckCircle2 className="w-4 h-4" /><span className="text-sm">Done</span></div><p className="text-2xl font-bold text-white">{completed}</p></div>
        <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800"><div className="flex items-center gap-2 text-red-400 mb-1"><XCircle className="w-4 h-4" /><span className="text-sm">Failed</span></div><p className="text-2xl font-bold text-white">{failed}</p></div>
      </div>

      <div className="mb-8"><div className="flex justify-between text-sm mb-2 text-white"><span>Progress</span><span>{completed}/{total} ({Math.round((completed/total)*100) || 0}%)</span></div><div className="h-3 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all" style={{ width: `${(completed/total)*100}%` }} /></div></div>

      {currentFeature && (
        <div className="mb-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2"><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /><h3 className="text-lg font-semibold text-blue-400">Building Now</h3></div>
          <p className="font-medium text-white">{currentFeature.name}</p>
          <p className="text-sm text-zinc-400">{currentFeature.description}</p>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 text-white">Feature Queue</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {features.map(feature => (
            <div key={feature.id} className={`p-4 rounded-lg border ${
              feature.status === 'completed' ? 'bg-green-500/5 border-green-500/20' : 
              feature.status === 'failed' ? 'bg-red-500/5 border-red-500/20' : 
              feature.status === 'in_progress' ? 'bg-blue-500/5 border-blue-500/20' : 
              feature.status === 'skipped' ? 'bg-zinc-800/50 border-zinc-700' :
              'bg-zinc-900 border-zinc-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {feature.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {feature.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                  {feature.status === 'in_progress' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                  {feature.status === 'pending' && <Clock className="w-5 h-5 text-zinc-500" />}
                  {feature.status === 'skipped' && <SkipForward className="w-5 h-5 text-zinc-500" />}
                  <div><p className="font-medium text-white">{feature.name}</p><p className="text-sm text-zinc-400">{feature.category}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  {feature.status === 'failed' && (<><button onClick={() => skipFeature(feature.id)} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white">Skip</button><button onClick={() => retryFeature(feature.id)} className="px-3 py-1 bg-amber-600 hover:bg-amber-700 rounded text-sm text-white">Retry</button></>)}
                  {feature.status === 'pending' && (<><button onClick={() => skipFeature(feature.id)} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white">Skip</button><button onClick={() => markCompleted(feature.id)} className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm text-white">Done</button></>)}
                  {feature.status === 'skipped' && <button onClick={() => retryFeature(feature.id)} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white">Re-queue</button>}
                </div>
              </div>
              {feature.error_message && <p className="mt-2 text-sm text-red-400 bg-red-500/10 p-2 rounded">{feature.error_message}</p>}
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">{showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}{showLogs ? 'Hide' : 'Show'} Logs</button>

      {showLogs && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="space-y-2 max-h-64 overflow-y-auto font-mono text-sm">
            {logs.map(log => (
              <div key={log.id} className={`flex gap-2 ${log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-green-400' : 'text-zinc-400'}`}>
                <span className="text-zinc-600">{new Date(log.created_at).toLocaleTimeString()}</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-zinc-500 text-sm flex items-center justify-center gap-4">
        <div className="flex items-center gap-2"><Server className="w-4 h-4" /><span>104.131.64.228</span></div>
        <div className="flex items-center gap-2"><Mail className="w-4 h-4" /><span>charles@botensten.com</span></div>
      </div>
    </div>
  );
}
