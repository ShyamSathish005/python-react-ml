import React, { useState } from 'react';
import { useModel, PythonModelProvider } from '@python-react-ml/react';
import FidelityVerifier from './FidelityVerifier';
import './App.css';

// Component using the useModel hook
function ModelDemo() {
  const { model, status, predict, error, reload } = useModel('/model.bundle.zip');
  const [inputValues, setInputValues] = useState([1.0, 2.0, 0.5]);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleInputChange = (index: number, value: string) => {
    const newValues = [...inputValues];
    newValues[index] = parseFloat(value) || 0;
    setInputValues(newValues);
  };

  const handlePredict = async () => {
    if (!model) return;

    setIsRunning(true);
    try {
      const result = await predict(inputValues);
      setPrediction(result);
    } catch (err) {
      console.error('Prediction failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleGetInfo = async () => {
    if (!model) return;

    try {
      const info = await model.getInfo?.();
      setModelInfo(info);
    } catch (err) {
      console.error('Failed to get model info:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return '#4ade80';
      case 'loading': return '#fbbf24';
      case 'error': return '#f87171';
      default: return '#6b7280';
    }
  };

  return (
    <div className="model-demo">
      <div className="status-section">
        <div className="status-indicator">
          <div
            className="status-dot"
            style={{ backgroundColor: getStatusColor(status) }}
          />
          <span>Status: {status}</span>
        </div>
        {error && (
          <div className="error-message">
            Error: {typeof error === 'string' ? error : (error as any).message || JSON.stringify(error)}
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className="loading-section">
          <div className="spinner" />
          <p>Loading Python model... This may take a moment on first load.</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="model-controls">
          <div className="input-section">
            <h3>Model Input</h3>
            <div className="input-grid">
              {inputValues.map((value, index) => (
                <div key={index} className="input-field">
                  <label>Feature {index + 1}:</label>
                  <input
                    type="number"
                    step="0.1"
                    value={value}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    disabled={isRunning}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handlePredict}
              disabled={isRunning}
              className="predict-button"
            >
              {isRunning ? 'Running...' : 'Run Prediction'}
            </button>
          </div>

          {prediction !== null && (
            <div className="prediction-section">
              <h3>Prediction Result</h3>
              <div className="prediction-result">
                {prediction.toFixed(4)}
              </div>
              <p className="prediction-description">
                This model outputs a probability between 0 and 1
              </p>
            </div>
          )}

          <div className="info-section">
            <button onClick={handleGetInfo} className="info-button">
              Get Model Info
            </button>
            {modelInfo && (
              <div className="model-info">
                <h4>Model Information</h4>
                <pre>{JSON.stringify(modelInfo, null, 2)}</pre>
              </div>
            )}
          </div>

          <div className="actions-section">
            <button onClick={reload} className="reload-button">
              Reload Model
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main App component with provider
function App() {
  return (
    <PythonModelProvider
      pyodideUrl="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"
      enableLogging={true}
    >
      <div className="App">
        <header className="app-header">
          <h1>🐍 Python React ML Demo</h1>
          <p>
            This demo shows how to run Python ML models directly in React using Pyodide.
            The model is a simple regression model that takes 3 features and outputs a probability.
          </p>
        </header>

        <main className="app-main">
          <ModelDemo />
          <FidelityVerifier />
        </main>

        <footer className="app-footer">
          <p>
            Built with Python React ML •
            <a href="https://github.com/yourusername/python-react-ml" target="_blank" rel="noopener noreferrer">
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </PythonModelProvider>
  );
}

export default App;