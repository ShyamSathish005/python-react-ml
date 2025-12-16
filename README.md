# python-react-ml

### Resilient Infrastructure for Browser-Based Python & ML Inference.

![npm version](https://img.shields.io/npm/v/python-react-ml?style=flat-square)
![license](https://img.shields.io/npm/l/python-react-ml?style=flat-square)
![build status](https://img.shields.io/github/actions/workflow/status/ShyamSathish005/python-react-ml/ci.yml?style=flat-square)

### Architecture Comparison

| Feature | Standard Wrappers | python-react-ml v2.0 |
| :--- | :--- | :--- |
| **Concurrency** | Manual `Worker` instantiation. blocking. | **Managed Worker Pools**. Parallel execution. |
| **Performance** | UI freezes during heavy compute. | **Zero-Copy Transfer**. Off-thread processing. |
| **Reliability** | Crashes kill the app. Leaks memory. | **Auto-Recovery**. Restarts dead workers. |
| **Safety** | Zombie processes on unmount. | **Strict Lifecycle**. Terminate on unmount. |

---


## Core Features

*   **Fault Tolerance**: The system implements an active watchdog. If a worker hangs or crashes (OOM), it is immediately terminated, and a replacement process is spawned transparently.
*   **Lifecycle Management**: Strictly enforces `terminate()` signals. When a React component unmounts, any in-flight requests are cancelled, and resources are freed to prevent memory leaks.
*   **Smart Caching**: Utilizes an IndexedDB layer to cache `.rpm.zip` model bundles, using ETag validation to ensure freshness without redundant downloads.
*   **Zero-Block Inference**: All computational logic is offloaded to a dedicated Web Worker pool, ensuring the main thread (UI) remains 60fps responsive even during heavy inference.

## Installation

```bash
npm install @python-react-ml/react @python-react-ml/core
```

## Quick Start

The following example demonstrates how to load a model and run inference safely. The hook handles all lifecycle, cleanup, and error recovery automatically.

```tsx
import React, { useState } from 'react';
import { useModel } from '@python-react-ml/react';

export const PredictionComponent = () => {
    const [input, setInput] = useState<number[]>([1.0, 2.0, 3.0]);
    
    // Initialize model with safety boundaries
    const { predict, status, error, result } = useModel('https://cdn.example.com/models/sentiment-v1.zip', {
        // Safely terminates worker if user leaves page before completion
        autoLoad: true,
        // Kill process if it hangs for more than 10 seconds
        timeout: 10000 
    });

    const handlePredict = async () => {
        try {
            // Promise resolves or throws Structured Error (Timeout/Memory)
            const outcome = await predict(input);
            console.log("Inference result:", outcome);
        } catch (err) {
            console.error("Inference failed managed recovery:", err);
        }
    };

    if (status === 'loading') return <span>Initializing Runtime...</span>;
    if (error) return <span>Error: {error.message}</span>;

    return (
        <div>
            <h1>Model Inference</h1>
            <button onClick={handlePredict} disabled={status !== 'ready'}>
                Run Prediction
            </button>
        </div>
    );
};
```

## Advanced Configuration

The `useModel` hook and core configuration object accept the following enterprise-grade options:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `timeout` | `number` | `30000` | Watchdog limit in milliseconds. Workers exceeding this are SIGKILLed. |
| `maxWorkers` | `number` | `1` | Maximum number of concurrent workers in the pool. |
| `strategy` | `'demand' \| 'eager'` | `'demand'` | Determines when the heavy runtime environment is allocated. |
| `memoryLimit` | `number` | `undefined` | Optional heap limit for the WASM environment. |

## Why Not Just Pyodide?

While Pyodide provides an excellent CPython runtime for the browser, using it directly in production presents significant engineering improvements. Raw Pyodide runs on the main thread by default (blocking the UI), lacks a built-in termination signal for infinite loops, and doesn't handle component lifecycle (leading to memory leaks).

**python-react-ml** wraps the runtime in an oversight layer that treats browser-side Python like a microservice: it manages health checks, restarts crashed instances, queues requests, and enforces strict timeouts to guarantee application stability.
