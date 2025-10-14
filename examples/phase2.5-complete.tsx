/**
 * Phase 2.5 Complete Example
 * 
 * This example demonstrates all Phase 2.5 features:
 * 1. Auto-optimization based on device capabilities
 * 2. Model registry for loading models
 * 3. Privacy features (differential privacy)
 * 4. Monitoring and explainability
 * 5. Real-time inference mode
 */

import React, { useState, useEffect } from 'react';
import { useModelEnhanced } from '../packages/react/src';
import type { ModelExplanation, InferenceMetrics } from '../packages/core/src';

export function SmartImageClassifier() {
  const [imageData, setImageData] = useState<any>(null);
  const [explanation, setExplanation] = useState<ModelExplanation | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<string>('');

  // Load model with Phase 2.5 features
  const {
    model,
    status,
    error,
    predict,
    explain,
    getMetrics,
    optimize,
    getPrivacyGuarantee,
    isReady,
    isOptimized,
    metrics
  } = useModelEnhanced('registry://vision/image-classifier@latest', {
    // Auto-optimization: automatically select best runtime and quantization
    optimization: {
      autoOptimize: true,
      latencyTarget: 100, // ms
      quantization: 'mixed-precision', // Will choose int8, fp16, or mixed precision
      compressionLevel: 'moderate'
    },

    // Load from model registry (NPM-like for models)
    registry: {
      version: 'latest',
      cache: true,
      autoUpdate: true,
      fallback: 'previous-version'
    },

    // Privacy features
    privacy: {
      localProcessingOnly: true, // Never send data to server
      differentialPrivacy: {
        enabled: true,
        epsilon: 1.0, // Privacy budget
        mechanism: 'gaussian'
      },
      encryptedInference: true
    },

    // Monitoring and explainability
    monitoring: {
      profiling: true,
      explainability: 'grad-cam', // Visual explanations
      driftDetection: true
    },

    // Callbacks
    onReady: () => console.log('Model ready!'),
    onDriftDetected: (severity) => alert(`Model drift detected: ${severity}`)
  });

  // Show device capabilities on mount
  useEffect(() => {
    if (isReady) {
      const info = getDeviceInfo();
      setDeviceInfo(info);
    }
  }, [isReady]);

  // Get device information
  const getDeviceInfo = () => {
    const gpu = navigator.gpu ? 'WebGPU' : 'WebGL';
    const cores = navigator.hardwareConcurrency || 'unknown';
    const memory = (performance as any).memory
      ? `${Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024)}MB`
      : 'unknown';
    
    return `Device: ${gpu}, Cores: ${cores}, Memory: ${memory}`;
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageArray = new Uint8Array(event.target?.result as ArrayBuffer);
      setImageData(imageArray);

      // Make prediction
      const result = await predict(imageArray);
      console.log('Prediction:', result);

      // Get explanation (what parts of image contributed to prediction)
      const exp = await explain(imageArray, 'grad-cam');
      setExplanation(exp);
    };

    reader.readAsArrayBuffer(file);
  };

  // Run manual optimization
  const handleOptimize = async () => {
    const result = await optimize();
    console.log('Optimization result:', result);
  };

  // Format metrics
  const formatMetrics = (m: InferenceMetrics | null) => {
    if (!m) return 'No metrics';
    const throughput = m.throughput ? m.throughput.toFixed(1) : 'N/A';
    const memory = m.memoryUsed ? (m.memoryUsed / 1024 / 1024).toFixed(1) : 'N/A';
    return `Latency: ${m.latency.toFixed(1)}ms, Memory: ${memory}MB, Throughput: ${throughput} inf/s`;
  };

  // Get privacy info
  const privacyInfo = getPrivacyGuarantee();

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>🚀 Phase 2.5: Smart Image Classifier</h1>

      {/* Device Info */}
      <div style={{ 
        background: '#f0f0f0', 
        padding: 15, 
        borderRadius: 8, 
        marginBottom: 20 
      }}>
        <h3>📊 Device Capabilities</h3>
        <p>{deviceInfo}</p>
        {isOptimized && <p style={{ color: 'green' }}>✓ Model optimized for this device</p>}
      </div>

      {/* Privacy Guarantee */}
      {privacyInfo && (
        <div style={{ 
          background: '#e8f5e9', 
          padding: 15, 
          borderRadius: 8, 
          marginBottom: 20 
        }}>
          <h3>🔒 Privacy Guarantee</h3>
          <p>✓ All processing happens on your device</p>
          <p>✓ Differential privacy: ε = {privacyInfo.epsilon}</p>
          <p>✓ Encrypted inference: {privacyInfo.encryptionUsed ? 'Yes' : 'No'}</p>
          <p>✓ No telemetry: {!privacyInfo.telemetryEnabled ? 'Yes' : 'No'}</p>
        </div>
      )}

      {/* Status */}
      <div style={{ marginBottom: 20 }}>
        <p>Status: <strong>{status}</strong></p>
        {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      </div>

      {/* Upload */}
      {isReady && (
        <div style={{ marginBottom: 20 }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ padding: 10 }}
          />
          <button
            onClick={handleOptimize}
            style={{ 
              padding: '10px 20px', 
              marginLeft: 10,
              cursor: 'pointer'
            }}
          >
            🚀 Optimize for This Device
          </button>
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div style={{ 
          background: '#fff3e0', 
          padding: 15, 
          borderRadius: 8, 
          marginBottom: 20 
        }}>
          <h3>📈 Performance Metrics</h3>
          <p>{formatMetrics(metrics)}</p>
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div style={{ 
          background: '#f3e5f5', 
          padding: 15, 
          borderRadius: 8, 
          marginBottom: 20 
        }}>
          <h3>🔍 Explanation ({explanation.method})</h3>
          <p>Prediction: <strong>{JSON.stringify(explanation.prediction)}</strong></p>
          <p>Confidence: <strong>{(explanation.confidence * 100).toFixed(1)}%</strong></p>
          
          {explanation.explanation.featureImportance && (
            <div>
              <h4>Feature Importance:</h4>
              <ul>
                {Object.entries(explanation.explanation.featureImportance).map(([key, value]) => (
                  <li key={key}>
                    {key}: <strong>{(value as number * 100).toFixed(1)}%</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div style={{ marginTop: 40, fontSize: 14, color: '#666' }}>
        <h3>✨ Phase 2.5 Features Demonstrated:</h3>
        <ul>
          <li><strong>Auto-Optimization:</strong> Automatically selects best runtime (WebGPU/ONNX/TensorFlow.js) and quantization (int8/fp16) based on your device</li>
          <li><strong>Model Registry:</strong> Load models from marketplace with versioning (like NPM for ML models)</li>
          <li><strong>Privacy-First:</strong> Differential privacy, local-only processing, encrypted inference, no telemetry</li>
          <li><strong>Explainability:</strong> Grad-CAM visual explanations showing which parts of image influenced prediction</li>
          <li><strong>Monitoring:</strong> Real-time metrics (latency, memory, throughput), drift detection</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Example 2: Real-Time Video Processing
// ============================================================================

export function RealtimeVideoProcessor() {
  const [fps, setFps] = useState(0);
  const [predictions, setPredictions] = useState<any[]>([]);

  const {
    model,
    predictSync,
    isReady,
    status,
    metrics
  } = useModelEnhanced('registry://vision/object-detector@latest', {
    // Real-time mode for video processing
    realtime: {
      latencyBudget: 16, // ms - 60 FPS target
      frameSkipping: 'adaptive',
      framePriority: 'speed',
      predictionQueue: {
        enabled: true,
        maxSize: 5,
        strategy: 'fifo'
      }
    },

    optimization: {
      autoOptimize: true,
      latencyTarget: 16, // 60 FPS
      quantization: 'int8' // Fast inference
    },

    monitoring: {
      profiling: true,
      driftDetection: false
    }
  });

  // Process video frame
  const processFrame = (frameData: any) => {
    if (!isReady) return;

    // Synchronous prediction for real-time processing
    const result = predictSync(frameData);
    
    if (result) {
      setPredictions(prev => [...prev.slice(-9), result]);
    }

    // Update FPS
    if (metrics && metrics.throughput !== undefined) {
      setFps(Math.round(metrics.throughput));
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🎥 Real-Time Video Processing</h1>
      <p>Status: {status}</p>
      <p>FPS: {fps}</p>
      
      {isReady && (
        <video
          autoPlay
          onPlay={(e) => {
            const video = e.target as HTMLVideoElement;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            const processVideo = () => {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              
              const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              processFrame(frameData.data);

              requestAnimationFrame(processVideo);
            };

            processVideo();
          }}
        />
      )}

      <div style={{ marginTop: 20 }}>
        <h3>Recent Detections:</h3>
        {predictions.slice(-5).map((pred, i) => (
          <div key={i}>{JSON.stringify(pred)}</div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Example 3: Multi-Model Pipeline
// ============================================================================

export function MultiModelPipeline() {
  const [result, setResult] = useState<any>(null);

  // This would use the pipeline system
  const processPipeline = async (input: any) => {
    // Example: Speech → Text → Sentiment → Response
    // 1. Speech to text model
    // 2. Sentiment analysis model  
    // 3. Response generation model
    
    // Pipeline handles caching, retry, parallel execution
    console.log('Pipeline processing:', input);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🔄 Multi-Model Pipeline</h1>
      <p>Process data through multiple models</p>
      <button onClick={() => processPipeline('test')}>
        Run Pipeline
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
