import { create } from 'zustand';
import type { Session, SessionSummary, PlaybackState, PlaybackStatus } from '../types/sessions';

interface SessionState {
  sessions: SessionSummary[];
  fullSessions: Session[];
  isRecording: boolean;
  isPaused: boolean;
  activeSessionId: string | null;
  playbackStatus: PlaybackStatus | null;

  setSessions: (sessions: SessionSummary[]) => void;
  addSession: (session: SessionSummary) => void;
  removeSession: (id: string) => void;
  setRecording: (recording: boolean) => void;
  setPaused: (paused: boolean) => void;
  setActiveSession: (id: string | null) => void;
  setPlaybackStatus: (status: PlaybackStatus | null) => void;
  addFullSession: (session: Session) => void;
  getFullSession: (id: string) => Session | undefined;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  fullSessions: [],
  isRecording: false,
  isPaused: false,
  activeSessionId: null,
  playbackStatus: null,

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      fullSessions: state.fullSessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),

  setRecording: (recording) => set({ isRecording: recording }),

  setPaused: (paused) => set({ isPaused: paused }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  setPlaybackStatus: (status) => set({ playbackStatus: status }),

  addFullSession: (session) =>
    set((state) => ({
      fullSessions: [...state.fullSessions.filter((s) => s.id !== session.id), session],
    })),

  getFullSession: (id) => get().fullSessions.find((s) => s.id === id),
}));
