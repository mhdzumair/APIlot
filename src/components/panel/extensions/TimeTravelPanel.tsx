import * as React from 'react';
import { useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMsg } from '@/lib/messaging';
import { browser } from '@/lib/browser';
import { useSessionStore } from '@/stores/useSessionStore';
import type { SessionSummary, Session, SessionExport } from '@/types/sessions';

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface SessionRowProps {
  session: SessionSummary;
  isActive: boolean;
  onPlay: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function SessionRow({ session, isActive, onPlay, onDelete, onExport }: SessionRowProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-xs ${
        isActive ? 'bg-primary/5' : 'hover:bg-muted/30'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{session.name}</span>
          <Badge
            variant="outline"
            className={`text-[9px] px-1 py-0 h-4 shrink-0 ${
              session.status === 'recording'
                ? 'border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10'
                : 'border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/10'
            }`}
          >
            {session.status}
          </Badge>
        </div>
        <div className="text-muted-foreground mt-0.5">
          {formatTimestamp(session.startTime)} &middot; {session.requestCount} req &middot; {formatDuration(session.duration)}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px]" onClick={onPlay} title="Play session">
          &#9654;
        </Button>
        <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px]" onClick={onExport} title="Export session">
          &#8595;
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-red-600 dark:text-red-400"
          onClick={onDelete}
          title="Delete session"
        >
          &times;
        </Button>
      </div>
    </div>
  );
}

export function TimeTravelPanel() {
  const {
    sessions,
    isRecording,
    isPaused,
    activeSessionId,
    playbackStatus,
    setSessions,
    addSession,
    removeSession,
    setRecording,
    setPaused,
    setActiveSession,
    setPlaybackStatus,
    addFullSession,
    getFullSession,
  } = useSessionStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const response = await sendMsg({ type: 'GET_SESSIONS' });
      if (response?.success) {
        setSessions(response.sessions);
      }
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to load sessions:', err);
    }
  }, [setSessions]);

  useEffect(() => {
    loadSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartRecording = useCallback(async () => {
    try {
      const response = await sendMsg({ type: 'CREATE_SESSION' });
      if (response?.success) {
        // Add as summary
        const session = response.session;
        addSession({
          id: session.id,
          name: session.name,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.duration,
          requestCount: session.requests.length,
          status: session.status,
        });
        setRecording(true);
        setPaused(false);
        setActiveSession(session.id);
      }
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to start recording:', err);
    }
  }, [addSession, setRecording, setPaused, setActiveSession]);

  const handlePauseRecording = useCallback(() => {
    setPaused(true);
  }, [setPaused]);

  const handleResumeRecording = useCallback(() => {
    setPaused(false);
  }, [setPaused]);

  const handleStopRecording = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const response = await sendMsg({ type: 'END_SESSION', sessionId: activeSessionId });
      if (response?.success && response.session) {
        const session = response.session;
        addFullSession(session);
        // Update session list
        await loadSessions();
      }
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to stop recording:', err);
    } finally {
      setRecording(false);
      setPaused(false);
      setActiveSession(null);
    }
  }, [activeSessionId, addFullSession, loadSessions, setRecording, setPaused, setActiveSession]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await sendMsg({ type: 'DELETE_SESSION', sessionId: id });
      removeSession(id);
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to delete session:', err);
    }
  }, [removeSession]);

  const handleExportSession = useCallback(async (id: string) => {
    try {
      const response = await sendMsg({ type: 'EXPORT_SESSION', sessionId: id });
      if (response?.success && response.data) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `apilot-session-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to export session:', err);
    }
  }, []);

  const handleImportSession = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data: SessionExport = JSON.parse(text);
      const response = await sendMsg({ type: 'IMPORT_SESSION', data });
      if (response?.success) {
        await loadSessions();
      }
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to import session:', err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [loadSessions]);

  // Playback controls
  const handlePlaySession = useCallback(async (sessionId: string) => {
    try {
      // Load full session if needed
      let session = getFullSession(sessionId);
      if (!session) {
        const exportResponse = await sendMsg({ type: 'EXPORT_SESSION', sessionId });
        if (exportResponse?.success && exportResponse.data) {
          session = exportResponse.data.session;
          addFullSession(session);
        }
      }
      if (!session || session.requests.length === 0) return;

      setPlaybackStatus({
        state: 'paused',
        currentIndex: 0,
        total: session.requests.length,
        sessionId,
        speed: 1,
        currentRequest: session.requests[0],
      });
    } catch (err) {
      console.error('[TimeTravelPanel] Failed to start playback:', err);
    }
  }, [getFullSession, addFullSession, setPlaybackStatus]);

  const handlePlaybackStep = useCallback(
    (direction: 'forward' | 'backward') => {
      if (!playbackStatus || !playbackStatus.sessionId) return;
      const session = getFullSession(playbackStatus.sessionId);
      if (!session) return;

      const newIndex =
        direction === 'forward'
          ? Math.min(playbackStatus.currentIndex + 1, playbackStatus.total - 1)
          : Math.max(playbackStatus.currentIndex - 1, 0);

      setPlaybackStatus({
        ...playbackStatus,
        currentIndex: newIndex,
        currentRequest: session.requests[newIndex],
      });
    },
    [playbackStatus, getFullSession, setPlaybackStatus]
  );

  const handleSeek = useCallback(
    (index: number) => {
      if (!playbackStatus || !playbackStatus.sessionId) return;
      const session = getFullSession(playbackStatus.sessionId);
      if (!session) return;

      setPlaybackStatus({
        ...playbackStatus,
        currentIndex: index,
        currentRequest: session.requests[index],
      });
    },
    [playbackStatus, getFullSession, setPlaybackStatus]
  );

  const handleStopPlayback = useCallback(() => {
    setPlaybackStatus(null);
  }, [setPlaybackStatus]);

  const handleTogglePlayback = useCallback(() => {
    if (!playbackStatus) return;
    setPlaybackStatus({
      ...playbackStatus,
      state: playbackStatus.state === 'playing' ? 'paused' : 'playing',
    });
  }, [playbackStatus, setPlaybackStatus]);

  const handleSpeedChange = useCallback(
    (speed: number) => {
      if (!playbackStatus) return;
      setPlaybackStatus({ ...playbackStatus, speed });
    },
    [playbackStatus, setPlaybackStatus]
  );

  const currentRequest = playbackStatus?.currentRequest;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Time Travel Debugging</h2>
          <p className="text-xs text-muted-foreground">Record and replay API sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImportSession} className="h-7 text-xs">
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={loadSessions} className="h-7 text-xs">
            Refresh
          </Button>
        </div>
      </div>

      {/* Recording controls */}
      <div className="rounded-md border shrink-0">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
          <div className="text-xs font-medium">Recording</div>
          {isRecording && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-600 dark:text-red-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              {isPaused ? 'Paused' : 'Recording...'}
            </div>
          )}
        </div>
        <div className="px-3 py-3 flex gap-2">
          {!isRecording ? (
            <Button size="sm" onClick={handleStartRecording} className="h-7 text-xs">
              &#9679; Start Recording
            </Button>
          ) : (
            <>
              {!isPaused ? (
                <Button variant="outline" size="sm" onClick={handlePauseRecording} className="h-7 text-xs">
                  &#9646;&#9646; Pause
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleResumeRecording} className="h-7 text-xs">
                  &#9654; Resume
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopRecording}
                className="h-7 text-xs text-red-600 dark:text-red-400"
              >
                &#9632; Stop
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Playback panel */}
      {playbackStatus && (
        <div className="rounded-md border shrink-0 bg-primary/5">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <div className="text-xs font-medium">Playback</div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={handleStopPlayback}
            >
              Close
            </Button>
          </div>
          <div className="px-3 py-3 space-y-3">
            {/* Request display */}
            {currentRequest && (
              <div className="rounded-md border bg-card px-3 py-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 ${
                      currentRequest.requestType === 'graphql'
                        ? 'border-pink-500/40 text-pink-600'
                        : 'border-blue-500/40 text-blue-600'
                    }`}
                  >
                    {currentRequest.requestType.toUpperCase()}
                  </Badge>
                  <span className="font-medium">
                    {currentRequest.operationName ?? currentRequest.endpoint ?? 'Request'}
                  </span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    #{playbackStatus.currentIndex + 1} / {playbackStatus.total}
                  </span>
                </div>
                <div className="text-muted-foreground truncate">{currentRequest.url}</div>
                {currentRequest.responseStatus != null && (
                  <div className="text-muted-foreground">
                    Status: {currentRequest.responseStatus}
                    {currentRequest.responseTime != null && ` &middot; ${currentRequest.responseTime}ms`}
                  </div>
                )}
              </div>
            )}

            {/* Scrubber */}
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={playbackStatus.total - 1}
                value={playbackStatus.currentIndex}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full h-1 accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0</span>
                <span>{playbackStatus.total - 1}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handlePlaybackStep('backward')}
                disabled={playbackStatus.currentIndex === 0}
                title="Step backward"
              >
                &#9665;&#9665;
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleTogglePlayback}
              >
                {playbackStatus.state === 'playing' ? '&#9646;&#9646;' : '&#9654;'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handlePlaybackStep('forward')}
                disabled={playbackStatus.currentIndex >= playbackStatus.total - 1}
                title="Step forward"
              >
                &#9655;&#9655;
              </Button>

              {/* Speed selector */}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[10px] text-muted-foreground">Speed:</span>
                {[0.5, 1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors ${
                      playbackStatus.speed === speed
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="rounded-md border flex-1 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between shrink-0">
          <div className="text-xs font-medium">Sessions ({sessions.length})</div>
        </div>
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-xs text-muted-foreground py-8">
            No sessions yet. Start recording to capture API traffic.
          </div>
        ) : (
          <div className="overflow-y-auto">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={playbackStatus?.sessionId === session.id}
                onPlay={() => handlePlaySession(session.id)}
                onDelete={() => handleDeleteSession(session.id)}
                onExport={() => handleExportSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
