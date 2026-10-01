'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, extractErrorCode } from '@/services/api';
import type {
  LabAlert,
  LabConnection,
  LabEvent,
  LabIncident,
  LabReport,
  LabRunningScenario,
  LabScenario,
  LabServerMessage,
  LabSessionStatus,
  LabRuleSummary,
} from './types';

const EVENTS_LIMIT = 500;
const WS_BASE = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/+$/, '');

function closeCodeToError(code: number): string {
  if (code === 1008) return 'SESSION_EXPIRED';
  if (code === 1013) return 'RATE_LIMIT';
  if (code === 1011) return 'RUNTIME_ERROR';
  return 'WS_CLOSED';
}

/**
 * Full lab session lifecycle: REST session creation, WebSocket protocol
 * (start/pause/resume/restart/speed/reload), streamed events/alerts and the
 * final report. The connection is established lazily on the first `start()`.
 */
export function useLabSession() {
  const [connection, setConnection] = useState<LabConnection>('idle');
  const [status, setStatus] = useState<LabSessionStatus>('idle');
  const [speed, setSpeed] = useState(2);
  const [speedOptions, setSpeedOptions] = useState<number[]>([1, 2, 4]);
  const [rules, setRules] = useState<LabRuleSummary[]>([]);
  const [ruleErrors, setRuleErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<LabScenario[]>([]);
  const [scenariosError, setScenariosError] = useState(false);
  const [runningScenario, setRunningScenario] = useState<LabRunningScenario | null>(null);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [alerts, setAlerts] = useState<LabAlert[]>([]);
  const [incident, setIncident] = useState<LabIncident | null>(null);
  const [report, setReport] = useState<LabReport | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<Promise<void> | null>(null);
  const intentionalCloseRef = useRef(false);

  const send = useCallback((payload: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const handleMessage = useCallback(
    (message: LabServerMessage) => {
      switch (message.type) {
        case 'connected':
          setRules(message.rules);
          setSpeed(message.speed);
          setSpeedOptions(message.speed_options);
          break;
        case 'started':
          setEvents([]);
          setAlerts([]);
          setIncident(null);
          setReport(null);
          setNotice(null);
          setErrorCode(null);
          setRunningScenario(message.scenario);
          setStatus(message.status);
          setSpeed(message.speed);
          break;
        case 'event':
          setEvents((prev) => {
            const next = [...prev, message.event];
            return next.length > EVENTS_LIMIT ? next.slice(next.length - EVENTS_LIMIT) : next;
          });
          break;
        case 'alert':
          setAlerts((prev) => [...prev, message.alert]);
          break;
        case 'incident':
          setIncident(message.incident);
          break;
        case 'state':
          setStatus(message.status);
          setSpeed(message.speed);
          break;
        case 'rules':
          setRules(message.rules);
          setRuleErrors(message.errors);
          setNotice(message.errors.length > 0 ? 'reloadFailed' : 'reloaded');
          break;
        case 'completed':
          setReport(message.report);
          setStatus('completed');
          break;
        case 'error':
          setErrorCode(message.code);
          break;
        case 'ping':
          send({ type: 'pong' });
          break;
      }
    },
    [send]
  );

  const connect = useCallback((): Promise<void> => {
    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return connectRef.current ?? Promise.resolve();
    }
    if (connectRef.current) return connectRef.current;

    setConnection('connecting');
    setErrorCode(null);

    const promise = (async () => {
      const response = await fetch(`${API_BASE}/api/v1/lab/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        let code = response.status === 429 ? 'RATE_LIMIT' : 'SESSION_FAILED';
        try {
          code = extractErrorCode(await response.json()) || code;
        } catch {
          /* resposta sem JSON: mantém o código por status */
        }
        throw new Error(code);
      }
      const session = (await response.json()) as { session_id: string; ticket: string };
      return await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(
          `${WS_BASE}/api/v1/ws/lab/${encodeURIComponent(session.session_id)}?ticket=${encodeURIComponent(session.ticket)}`
        );
        wsRef.current = socket;
        let opened = false;

        socket.onopen = () => {
          opened = true;
          setConnection('connected');
          resolve();
        };
        socket.onmessage = (evt) => {
          try {
            handleMessage(JSON.parse(evt.data) as LabServerMessage);
          } catch {
            /* mensagem malformada é ignorada */
          }
        };
        socket.onerror = () => {
          if (!opened) reject(new Error('WS_CLOSED'));
        };
        socket.onclose = (evt) => {
          wsRef.current = null;
          connectRef.current = null;
          if (intentionalCloseRef.current) {
            setConnection('idle');
            return;
          }
          if (!opened) {
            setConnection('error');
            setErrorCode(closeCodeToError(evt.code));
            reject(new Error(closeCodeToError(evt.code)));
            return;
          }
          setConnection('idle');
          setErrorCode(closeCodeToError(evt.code));
        };
      });
    })().catch((error: unknown) => {
      connectRef.current = null;
      setConnection('error');
      setErrorCode(error instanceof Error ? error.message : 'SESSION_FAILED');
      throw error;
    });

    connectRef.current = promise;
    return promise;
  }, [handleMessage]);

  const start = useCallback(
    async (scenarioId: string) => {
      setErrorCode(null);
      setNotice(null);
      try {
        await connect();
      } catch {
        return;
      }
      if (!send({ type: 'start', scenario: scenarioId })) setErrorCode('WS_CLOSED');
    },
    [connect, send]
  );

  const restart = useCallback(() => {
    setErrorCode(null);
    if (!send({ type: 'restart' })) setErrorCode('WS_CLOSED');
  }, [send]);

  const pause = useCallback(() => {
    setErrorCode(null);
    if (!send({ type: 'pause' })) setErrorCode('WS_CLOSED');
  }, [send]);

  const resume = useCallback(() => {
    setErrorCode(null);
    if (!send({ type: 'resume' })) setErrorCode('WS_CLOSED');
  }, [send]);

  const changeSpeed = useCallback(
    (value: number) => {
      send({ type: 'speed', value });
    },
    [send]
  );

  const reloadRules = useCallback(() => {
    setNotice(null);
    if (!send({ type: 'reload_rules' })) setErrorCode('WS_CLOSED');
  }, [send]);

  const clearError = useCallback(() => setErrorCode(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  // Catálogo de cenários (REST).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/lab/scenarios`);
        if (!response.ok) throw new Error('scenarios');
        const data = (await response.json()) as LabScenario[];
        if (!cancelled) setScenarios(data);
      } catch {
        if (!cancelled) setScenariosError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Encerra a sessão no unmount.
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    };
  }, []);

  return {
    connection,
    status,
    speed,
    speedOptions,
    rules,
    ruleErrors,
    notice,
    errorCode,
    scenarios,
    scenariosError,
    runningScenario,
    events,
    alerts,
    incident,
    report,
    start,
    restart,
    pause,
    resume,
    changeSpeed,
    reloadRules,
    retry: connect,
    clearError,
    clearNotice,
  };
}
