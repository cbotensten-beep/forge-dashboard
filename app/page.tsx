'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Play, Pause, RefreshCw, Zap, CheckCircle2, 
  XCircle, Clock, Settings, SkipForward,
  Loader2, ChevronDown, ChevronUp, Mail, Server,
  Plus, ArrowUp, ArrowUpToLine, Trash2, X
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
  instructions?: string;
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [skipOnError, setSkipOnError] = useState(false);
  const [specInput, setSpecInput] = useState('');
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  const parseSpec = (spec: string) => {
    const lines = spec.trim().split('\n');
    let name = '', category = 'crm', description = '';
    const instructionLines: string[] = [];
    let inInstructions = false;

    for (const line of lines) {
      if (line.startsWith('NAME:')) {
        name = line.replace('NAME:', '').trim();
      } else if (line.startsWith('CATEGORY:')) {
        category = line.replace('CATEGORY:', '').trim();
      } else if (line.startsWith('DESCRIPTION:')) {
        description = line.replace('DESCRIPTION:', '').trim();
      } else if (line.trim() === '---') {
        inInstructions = true;
      } else if (inInstructions) {
        instructionLines.push(line);
      }
    }

    return { name, category, description, instructions: instructionLines.join('\n').trim() };
  };

  const addFeature = async (startNow: boolean) => {
    const parsed = parseSpec(specInput);
    
    if (!parsed.name) {
      showToast('Missing NAME: in spec', 'error');
      return;
    }

    const pendingFeatures = features.filter(f => f.status === 'pending');
    const lowestPriority = pendingFeatures.length > 0 
      ? Math.max(...pendingFeatures.map(f => f.priority)) + 1 
      : 100;
    
    const newPriority = startNow ? 0 : lowestPriority;

    const { error } = await supabase.from('forge_features').insert({
      name: parsed.name,
      description: parsed.description || parsed.name,
      category: parsed.category,
      priority: newPriority,
      status: 'pending',
      instructions: parsed.instructions
    });

    if (error) {
      showToast('Failed to add: ' + error.message, 'error');
      return;
    }

    showToast(`✓ ${parsed.name} added to queue`, 'success');
    setSpecInput('');
    setShowAddForm(false);
    loadData();

    if (startNow && enginePaused) {
      await supabase.from('forge_config').upsert({ key: 'engine_paused', value: 'false' });
      setEnginePaused(false);
    }
  };

  const moveToTop = async (id: string) => {
    const minPriority = Math.min(...features.filter(f => f.status === 'pending').map(f => f.priority));
    await supabase.from('forge_features').update({ priority: minPriority - 1 }).eq('id', id);
    setSelectedFeature(null);
    loadData();
    showToast('Moved to top');
  };

  const moveUp = async (id: string) => {
    const feature = features.find(f => f.id === id);
    if (!feature) return;
    await supabase.from('forge_features').update({ priority: feature.priority - 1.5 }).eq('id', id);
    setSelectedFeature(null);
    loadData();
  };

  const skipFeature = async (id: string) => {
    await supabase.from('forge_features').update({ status: 'skipped' }).eq('id', id);
    setSelectedFeature(null);
    loadData();
  };

  const retryFeature = async (id: string) => {
    await supabase.from('forge_features').update({ status: 'pending', retry_count: 0, error_message: null }).eq('id', id);
    setSelectedFeature(null);
    loadData();
  };

  const markCompleted = async (id: string) => {
    await supabase.from('forge_features').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    setSelectedFeature(null);
    loadData();
  };

  const deleteFeature = async (id: string) => {
    await supabase.from('forge_features').delete().eq('id', id);
    setSelectedFeature(null);
    loadData();
    showToast('Feature deleted');
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
  const total = features.length;
  
  const currentFeature = features.find(f => f.status === 'in_progress');
  const isBuilding = inProgress > 0;
  const isRunning = isBuilding || !enginePaused;
  const isPausing = enginePaused && isBuilding;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-950"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;

  return (
    <div className="min-h-screen p-4 pb-24 bg-zinc-950">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-80 p-4 rounded-lg z-50 ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white font-medium shadow-lg`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg"><Zap className="w-6 h-6 text-amber-500" /></div>
          <div><h1 className="text-xl font-bold text-white">Forge Engine</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isPausing ? 'bg-amber-500/20 text-amber-400' :
            isRunning ? 'bg-green-500/20 text-green-400' : 
            'bg-zinc-800 text-zinc-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isPausing ? 'bg-amber-500 animate-pulse' :
              isRunning ? 'bg-green-500 animate-pulse' : 
              'bg-zinc-500'
            }`} />
            {isPausing ? 'Pausing' : isRunning ? 'Running' : 'Paused'}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 mb-6">
        <button 
          onClick={toggleEngine} 
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
            enginePaused ? 'bg-green-600' : 'bg-amber-600'
          } text-white`}
        >
          {enginePaused ? <><Play className="w-5 h-5" />Start</> : <><Pause className="w-5 h-5" />Pause</>}
        </button>
        <button onClick={() => setShowAddForm(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium bg-blue-600 text-white">
          <Plus className="w-5 h-5" />Add Feature
        </button>
        <button onClick={loadData} className="p-3 bg-zinc-800 rounded-lg text-white"><RefreshCw className="w-5 h-5" /></button>
        <button onClick={() => setShowSettings(!showSettings)} className="p-3 bg-zinc-800 rounded-lg text-white"><Settings className="w-5 h-5" /></button>
      </div>

      {/* Add Feature Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center">
          <div className="bg-zinc-900 w-full md:w-[500px] md:rounded-lg rounded-t-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">Add Feature</h2>
              <button onClick={() => setShowAddForm(false)} className="p-2 text-zinc-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <p className="text-sm text-zinc-400 mb-3">Paste spec from Claude:</p>
              <textarea 
                value={specInput}
                onChange={(e) => setSpecInput(e.target.value)}
                placeholder={`NAME: Feature Name\nCATEGORY: crm\nDESCRIPTION: What it does\n---\nDetailed instructions here...`}
                className="w-full h-48 p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 text-sm font-mono"
              />
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => addFeature(false)} 
                  className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-medium text-white"
                >
                  Add to Queue
                </button>
                <button 
                  onClick={() => addFeature(true)} 
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium text-white"
                >
                  Start Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature Action Sheet */}
      {selectedFeature && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={() => setSelectedFeature(null)}>
          <div className="bg-zinc-900 w-full rounded-t-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mt-3 mb-2" />
            <div className="p-4 border-b border-zinc-800">
              <p className="font-medium text-white">{features.find(f => f.id === selectedFeature)?.name}</p>
            </div>
            <div className="p-2">
              {features.find(f => f.id === selectedFeature)?.status === 'pending' && (
                <>
                  <button onClick={() => moveToTop(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                    <ArrowUpToLine className="w-5 h-5 text-amber-500" />Move to Top
                  </button>
                  <button onClick={() => moveUp(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                    <ArrowUp className="w-5 h-5 text-blue-500" />Move Up
                  </button>
                  <button onClick={() => markCompleted(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />Mark as Done
                  </button>
                  <button onClick={() => skipFeature(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                    <SkipForward className="w-5 h-5 text-zinc-400" />Skip
                  </button>
                </>
              )}
              {features.find(f => f.id === selectedFeature)?.status === 'failed' && (
                <>
                  <button onClick={() => retryFeature(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                    <RefreshCw className="w-5 h-5 text-amber-500" />Retry
                  </button>
                  <button onClick={() => skipFeature(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                    <SkipForward className="w-5 h-5 text-zinc-400" />Skip
                  </button>
                </>
              )}
              {features.find(f => f.id === selectedFeature)?.status === 'skipped' && (
                <button onClick={() => retryFeature(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-white hover:bg-zinc-800 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-amber-500" />Re-queue
                </button>
              )}
              <button onClick={() => deleteFeature(selectedFeature)} className="w-full flex items-center gap-3 p-4 text-red-400 hover:bg-zinc-800 rounded-lg">
                <Trash2 className="w-5 h-5" />Delete
              </button>
            </div>
            <div className="p-2 border-t border-zinc-800">
              <button onClick={() => setSelectedFeature(null)} className="w-full p-4 text-zinc-400 font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <h3 className="text-lg font-semibold mb-4 text-white">Settings</h3>
          <div className="space-y-3">
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="bg-zinc-900 p-3 rounded-lg text-center">
          <p className="text-lg font-bold text-white">{pending}</p>
          <p className="text-xs text-zinc-400">Pending</p>
        </div>
        <div className="bg-zinc-900 p-3 rounded-lg text-center">
          <p className="text-lg font-bold text-white">{inProgress}</p>
          <p className="text-xs text-blue-400">Building</p>
        </div>
        <div className="bg-zinc-900 p-3 rounded-lg text-center">
          <p className="text-lg font-bold text-white">{completed}</p>
          <p className="text-xs text-green-400">Done</p>
        </div>
        <div className="bg-zinc-900 p-3 rounded-lg text-center">
          <p className="text-lg font-bold text-white">{failed}</p>
          <p className="text-xs text-red-400">Failed</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2 text-zinc-400">
          <span>Progress</span>
          <span>{completed}/{total} ({Math.round((completed/total)*100) || 0}%)</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-green-500" style={{ width: `${(completed/total)*100}%` }} />
        </div>
      </div>

      {/* Building Now */}
      {currentFeature && (
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-400 font-medium">Building Now</span>
          </div>
          <p className="font-medium text-white">{currentFeature.name}</p>
        </div>
      )}

      {/* Feature Queue */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3 text-white">Queue</h2>
        <div className="space-y-2">
          {features.map((feature, idx) => (
            <div 
              key={feature.id} 
              onClick={() => feature.status !== 'in_progress' && feature.status !== 'completed' && setSelectedFeature(feature.id)}
              className={`p-4 rounded-lg border cursor-pointer active:scale-[0.98] transition-transform ${
                feature.status === 'completed' ? 'bg-green-500/5 border-green-500/20' : 
                feature.status === 'failed' ? 'bg-red-500/5 border-red-500/20' : 
                feature.status === 'in_progress' ? 'bg-blue-500/5 border-blue-500/20' : 
                feature.status === 'skipped' ? 'bg-zinc-800/50 border-zinc-700' :
                'bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-3">
                {feature.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                {feature.status === 'failed' && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                {feature.status === 'in_progress' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />}
                {feature.status === 'pending' && <span className="w-5 h-5 flex items-center justify-center text-xs text-zinc-500 font-mono shrink-0">{idx + 1}</span>}
                {feature.status === 'skipped' && <SkipForward className="w-5 h-5 text-zinc-500 shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{feature.name}</p>
                  <p className="text-sm text-zinc-500">{feature.category}</p>
                </div>
              </div>
              {feature.error_message && (
                <p className="mt-2 text-sm text-red-400 bg-red-500/10 p-2 rounded truncate">{feature.error_message}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Logs */}
      <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 text-zinc-400 mb-4">
        {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {showLogs ? 'Hide' : 'Show'} Logs
      </button>

      {showLogs && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 mb-6">
          <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-xs">
            {logs.map(log => (
              <div key={log.id} className={log.level === 'error' ? 'text-red-400' : 'text-zinc-400'}>
                <span className="text-zinc-600">{new Date(log.created_at).toLocaleTimeString()}</span> {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-zinc-600 text-xs flex items-center justify-center gap-4">
        <div className="flex items-center gap-1"><Server className="w-3 h-3" />104.131.64.228</div>
        <div className="flex items-center gap-1"><Mail className="w-3 h-3" />charles@botensten.com</div>
      </div>
    </div>
  );
}
