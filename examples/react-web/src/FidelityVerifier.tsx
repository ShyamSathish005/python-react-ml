import React, { useCallback, useMemo, useState } from 'react';

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';
const PYTHON_SUMMARIZER = `
from __future__ import annotations

def summarize(chunks):
    if chunks is None:
        return ""
    safe_chunks = []
    for chunk in chunks:
        if chunk is None:
            continue
        text = str(chunk)
        safe_chunks.append(text[:5000])
    if not safe_chunks:
        return ""
    summary = "\n".join(safe_chunks)
    return summary[:20000]
`;

interface TestVector {
  id: string;
  input: string[];
  expected_output: string;
}

interface VerificationResult {
  id: string;
  expected: string;
  actual: string;
}

let pyodidePromise: Promise<any> | null = null;

async function ensurePyodide() {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise(async (resolve, reject) => {
    try {
      if (!(window as any).loadPyodide) {
        await new Promise<void>((res, rej) => {
          const script = document.createElement('script');
          script.src = PYODIDE_URL;
          script.async = true;
          script.onload = () => res();
          script.onerror = () => rej(new Error('Failed to load Pyodide script'));
          document.head.appendChild(script);
        });
      }

      const pyodide = await (window as any).loadPyodide({ indexURL: PYODIDE_INDEX });
      await pyodide.runPythonAsync(PYTHON_SUMMARIZER);
      resolve(pyodide);
    } catch (err) {
      reject(err);
    }
  });

  return pyodidePromise;
}

async function loadVectors(): Promise<TestVector[]> {
  const response = await fetch('/test_vectors.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch test vectors: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.vectors)) {
    throw new Error('Malformed test vector manifest');
  }
  return payload.vectors as TestVector[];
}

export function FidelityVerifier() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'done' | 'error'>('idle');
  const [vectors, setVectors] = useState<TestVector[]>([]);
  const [mismatches, setMismatches] = useState<VerificationResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    switch (status) {
      case 'idle':
        return 'Ready to verify WebAssembly fidelity against Python baselines.';
      case 'loading':
        return 'Loading test vectors...';
      case 'running':
        return 'Running vectors through Pyodide (WebAssembly)...';
      case 'done':
        return mismatches.length === 0
          ? 'All vectors match between Python and WebAssembly.'
          : `${mismatches.length} mismatches detected.`;
      case 'error':
        return error ?? 'Verification failed.';
      default:
        return '';
    }
  }, [status, mismatches.length, error]);

  const handleRun = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setMismatches([]);

    try {
      const [loadedVectors, pyodide] = await Promise.all([loadVectors(), ensurePyodide()]);
      setVectors(loadedVectors);
      setStatus('running');

      const failures: VerificationResult[] = [];
      for (const vector of loadedVectors) {
        pyodide.globals.set('chunks', vector.input);
        const result: string = pyodide.runPython('summarize(chunks)');
        pyodide.globals.del('chunks');
        if (result !== vector.expected_output) {
          failures.push({ id: vector.id, expected: vector.expected_output, actual: result });
        }
      }

      setMismatches(failures);
      setStatus('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(message);
      setStatus('error');
      console.error('Fidelity verification failed:', err);
    }
  }, []);

  return (
    <div className="fidelity-card">
      <div className="fidelity-header">
        <div>
          <h3>End-to-End Fidelity Verification</h3>
          <p>{summary}</p>
        </div>
        <button onClick={handleRun} disabled={status === 'loading' || status === 'running'}>
          {status === 'running' ? 'Verifying…' : 'Run Verification'}
        </button>
      </div>

      <div className="fidelity-metrics">
        <div>
          <span className="metric-label">Vectors Loaded</span>
          <span className="metric-value">{vectors.length || '—'}</span>
        </div>
        <div>
          <span className="metric-label">Mismatches</span>
          <span className={`metric-value ${mismatches.length ? 'metric-error' : 'metric-pass'}`}>
            {status === 'running' ? '…' : mismatches.length}
          </span>
        </div>
        <div>
          <span className="metric-label">Status</span>
          <span className="metric-value">{status}</span>
        </div>
      </div>

      {status === 'error' && error && (
        <div className="fidelity-error">{error}</div>
      )}

      {mismatches.length > 0 && (
        <div className="fidelity-table">
          <div className="table-header">
            <span>ID</span>
            <span>Expected</span>
            <span>Actual</span>
          </div>
          {mismatches.map((mismatch) => (
            <div key={mismatch.id} className="table-row">
              <span className="mono">{mismatch.id}</span>
              <span className="mono">{mismatch.expected || '""'}</span>
              <span className="mono error-text">{mismatch.actual || '""'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FidelityVerifier;
