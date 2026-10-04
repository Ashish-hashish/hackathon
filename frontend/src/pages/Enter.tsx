import React, { useState } from 'react';
import { api, UserStatusResponse } from '../api/client';
import { Cpu, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck, Zap, Lock, Sparkles } from 'lucide-react';

interface EnterProps {
  onEntered: (entryResult?: { entry_id: string; status: string }) => void;
  statusData?: UserStatusResponse | null;
  selectedEventId?: string;
}

// Fallback in-thread solver if Web Worker is restricted in browser environment
function countLeadingZeroBits(bytes: Uint8Array): number {
  let zeros = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0) {
      zeros += 8;
    } else {
      zeros += (Math.clz32(byte) - 24);
      break;
    }
  }
  return zeros;
}

async function solvePoWFallback(
  nonce: string,
  difficultyBits: number,
  onProgress?: (iters: number) => void
): Promise<{ solution: string; iterations: number; durationMs: number }> {
  const startTime = performance.now();
  const encoder = new TextEncoder();
  let iteration = 0;
  const maxIterations = 5_000_000;

  while (iteration < maxIterations) {
    const solutionStr = iteration.toString();
    const puzzle = `${nonce}:${solutionStr}`;
    const puzzleBytes = encoder.encode(puzzle);

    const hashBuffer = await crypto.subtle.digest('SHA-256', puzzleBytes);
    const hashBytes = new Uint8Array(hashBuffer);

    if (countLeadingZeroBits(hashBytes) >= difficultyBits) {
      const durationMs = performance.now() - startTime;
      return { solution: solutionStr, iterations: iteration, durationMs };
    }

    if (iteration % 2000 === 0 && iteration > 0 && onProgress) {
      onProgress(iteration);
    }
    iteration++;
  }
  throw new Error('PoW iterations exhausted');
}

function extractNonce(challengeStr: string, explicitNonce?: string): string {
  if (explicitNonce) return explicitNonce;
  try {
    let base64 = challengeStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const rawJson = atob(base64);
    const parsed = JSON.parse(rawJson);
    return parsed.nonce || 'nonce';
  } catch (e) {
    return 'nonce';
  }
}

export const Enter: React.FC<EnterProps> = ({ onEntered, statusData, selectedEventId }) => {
  const [loading, setLoading] = useState(false);
  const [powProgress, setPowProgress] = useState<{ iterations: number; durationMs?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const targetEventId = selectedEventId || statusData?.event_id;

  const startEntryFlow = async () => {
    setLoading(true);
    setError(null);
    setPowProgress({ iterations: 0 });

    try {
      // 1. Fetch challenge for this event
      const chalData = await api.getChallenge(targetEventId);
      const nonce = extractNonce(chalData.challenge, chalData.nonce);
      const difficultyBits = chalData.difficulty_bits;

      // 2. Try solving via Web Worker, fallback to async inline solver
      let solvedSolution: string | null = null;
      let solvedIterations = 0;
      let solvedDurationMs = 0;

      try {
        const worker = new Worker(new URL('../workers/pow.worker.ts', import.meta.url), {
          type: 'module',
        });

        const workerResult = await new Promise<{ solution: string; iterations: number; durationMs: number }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              worker.terminate();
              reject(new Error('Worker timeout, switching to inline solver'));
            }, 10000);

            worker.onmessage = (e: MessageEvent) => {
              const msg = e.data;
              if (msg.type === 'PROGRESS') {
                setPowProgress({ iterations: msg.iterations });
              } else if (msg.type === 'SUCCESS') {
                clearTimeout(timeout);
                worker.terminate();
                resolve({ solution: msg.solution, iterations: msg.iterations, durationMs: msg.durationMs });
              } else if (msg.type === 'FAILED') {
                clearTimeout(timeout);
                worker.terminate();
                reject(new Error('PoW worker exhausted iterations'));
              }
            };

            worker.onerror = (err) => {
              clearTimeout(timeout);
              worker.terminate();
              reject(err);
            };

            worker.postMessage({ nonce, difficultyBits });
          }
        );

        solvedSolution = workerResult.solution;
        solvedIterations = workerResult.iterations;
        solvedDurationMs = workerResult.durationMs;
      } catch (workerErr) {
        // Fallback to in-thread solver
        const fallbackRes = await solvePoWFallback(nonce, difficultyBits, (iters) => {
          setPowProgress({ iterations: iters });
        });
        solvedSolution = fallbackRes.solution;
        solvedIterations = fallbackRes.iterations;
        solvedDurationMs = fallbackRes.durationMs;
      }

      setPowProgress({ iterations: solvedIterations, durationMs: solvedDurationMs });

      // 3. Submit entry to O(1) hot path
      if (solvedSolution !== null) {
        const entryRes = await api.submitEntry(chalData.challenge, solvedSolution, targetEventId);
        setSuccess(true);
        onEntered(entryRes);
      } else {
        throw new Error('PoW solving failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to submit entry. Please try again.');
      setLoading(false);
    }
  };

  const windowState = statusData?.window_state || 'OPEN';

  return (
    <div className="max-w-2xl mx-auto my-12 px-4">
      {/* Outer Card */}
      <div className="p-6 sm:p-8 bg-[#0d121e] border border-[#1b2338] rounded-2xl shadow-2xl overflow-hidden relative">
        <div className="h-1 w-full absolute top-0 left-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />

        <div className="text-center mb-8 pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Window State: {windowState}
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">Join Drop Queue</h2>
          <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            Entering at second 1 or minute 5 is identical. Queue position is determined strictly by the cryptographic draw.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Entry verified and recorded! Transitioning to live waiting room...</span>
          </div>
        )}

        <div className="p-4 rounded-xl bg-[#080b12] border border-[#182133] mb-6 space-y-2.5">
          <div className="flex items-center gap-3 text-slate-300 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Idempotent submission: duplicate requests produce zero extra tickets.</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300 text-xs">
            <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Client-side Proof-of-Work (PoW) solves in Web Worker to prevent automation.</span>
          </div>
        </div>

        {powProgress && (
          <div className="mb-6 p-4 rounded-xl bg-[#080b12] border border-[#182133]">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400 animate-pulse" />
                Solving Hashcash SHA-256...
              </span>
              <span className="font-mono text-white font-bold">{powProgress.iterations.toLocaleString()} hashes</span>
            </div>
            <div className="w-full bg-[#141b2c] rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 h-2 rounded-full animate-pulse w-full"></div>
            </div>
            {powProgress.durationMs && (
              <p className="text-[11px] text-emerald-400 mt-2 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Solved in {powProgress.durationMs.toFixed(1)} ms
              </p>
            )}
          </div>
        )}

        <button
          onClick={startEntryFlow}
          disabled={loading || windowState !== 'OPEN' || success}
          className="w-full py-4 px-6 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-sm transition-all shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing Entry...</span>
            </>
          ) : (
            <>
              <span>Submit Entry to Drop</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Enter;
