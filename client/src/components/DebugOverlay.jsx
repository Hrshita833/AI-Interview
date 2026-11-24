import React, { useState, useEffect } from "react";
import { isDebugMode, subscribeDebugLogs, clearDebugLogs } from "../utils/debugLogger";

export default function DebugOverlay({ currentMode = "voice", audioContextState = "unknown" }) {
  const [logs, setLogs] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isDebugMode()) return;
    const unsubscribe = subscribeDebugLogs((allLogs) => {
      // Display only the last 15 events as required
      setLogs(allLogs.slice(-15));
    });
    return unsubscribe;
  }, []);

  if (!isDebugMode()) {
    return null;
  }

  const copyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.time}] [${l.category.toUpperCase()}] ${l.type}: ${l.message} ${
            l.details ? JSON.stringify(l.details) : ""
          }`
      )
      .join("\n");
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getBadgeColor = (category) => {
    switch (category) {
      case "tts":
        return "bg-purple-900 text-purple-200 border-purple-700";
      case "audio":
        return "bg-blue-900 text-blue-200 border-blue-700";
      case "wav":
        return "bg-emerald-900 text-emerald-200 border-emerald-700";
      case "mic":
        return "bg-amber-900 text-amber-200 border-amber-700";
      case "mode":
        return "bg-pink-900 text-pink-200 border-pink-700";
      case "context":
        return "bg-cyan-900 text-cyan-200 border-cyan-700";
      default:
        return "bg-gray-800 text-gray-200 border-gray-700";
    }
  };

  return (
    <aside
      aria-label="Diagnostic Debug Overlay"
      className="fixed bottom-3 right-3 z-50 max-w-sm sm:max-w-md w-full bg-gray-950/95 text-gray-100 text-xs rounded-xl shadow-2xl border border-gray-700 font-mono backdrop-blur-md overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-bold text-emerald-400">DEBUG (?debug=1)</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
            Mode: {currentMode.toUpperCase()}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
            Ctx: {audioContextState}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyLogs}
            className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
            title="Copy logs to clipboard"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={clearDebugLogs}
            className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
            title="Clear logs"
          >
            Clear
          </button>
          <button
            onClick={() => setMinimized((m) => !m)}
            className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
          >
            {minimized ? "Expand" : "Min"}
          </button>
        </div>
      </div>

      {/* Body: Last 15 events */}
      {!minimized && (
        <div className="p-2 max-h-72 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-gray-700">
          {logs.length === 0 ? (
            <div className="text-gray-500 py-4 text-center">No voice events recorded yet.</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-1.5 rounded bg-gray-900/80 border border-gray-800/80 hover:border-gray-700 text-[11px] leading-tight"
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-[10px]">{log.time}</span>
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] uppercase font-semibold border ${getBadgeColor(
                        log.category
                      )}`}
                    >
                      {log.category}
                    </span>
                    <span className="font-semibold text-gray-200">{log.type}</span>
                  </div>
                </div>
                <div className="text-gray-300 break-words">{log.message}</div>
                {log.details && (
                  <div className="mt-1 text-[10px] text-gray-400 bg-gray-950 p-1 rounded border border-gray-900 overflow-x-auto">
                    {typeof log.details === "object"
                      ? JSON.stringify(log.details)
                      : String(log.details)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
