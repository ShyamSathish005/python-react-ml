# Phase 2.5 React Integration

This document describes the React integration for Phase 2.5 features.

## Overview

Phase 2.5 React integration provides a powerful, developer-friendly API for using advanced ML features in React applications.

## Main Hook: `useModelEnhanced`

The `useModelEnhanced` hook (aliased as `useModel` for backward compatibility) provides a complete interface to all Phase 2.5 features.

```typescript
import { useModelEnhanced } from '@python-react-ml/react';

const {
  // Core
  model,
  status,
  error,
  
  // Actions
  predict,
  predictSync,
  unload,
  reload,
  
  // Phase 2.5 methods
  explain,
  profile,
  optimize,
  getMetrics,
  getPrivacyGuarantee,
  
  // State
  isReady,
  isLoading,
  isPredicting,
  isOptimized,
  
  // Metrics
  metrics,
  version
} = useModelEnhanced(modelUrl, options);
```

## Configuration Options

### Auto-Optimization

Automatically selects the best runtime and optimizations for the user's device:

```typescript
optimization: {
  autoOptimize: true,
  latencyTarget: 100, // ms
  quantization: 'mixed-precision',
  compressionLevel: 'moderate',
  memoryBudget: 512, // MB
  powerMode: 'balanced'
}
```

### Model Registry

Load models from a centralized registry with versioning:

```typescript
registry: {
  version: 'latest',
  cache: true,
  autoUpdate: true,
  fallback: 'previous-version'
}
```

### Privacy Features

Enable differential privacy and local-only processing:

```typescript
privacy: {
  localProcessingOnly: true,
  differentialPrivacy: {
    enabled: true,
    epsilon: 1.0,
    mechanism: 'gaussian'
  },
  encryptedInference: true,
  clearMemoryAfter: true
}
```

### Monitoring & Explainability

Track performance and explain predictions:

```typescript
monitoring: {
  profiling: true,
  explainability: 'grad-cam',
  driftDetection: true,
  adversarialTesting: 'test'
}
```

### Real-Time Mode

For video processing and gaming:

```typescript
realtime: {
  latencyBudget: 16, // 60 FPS
  frameSkipping: 'adaptive',
  framePriority: 'speed',
  predictionQueue: {
    enabled: true,
    maxSize: 10,
    strategy: 'fifo'
  }
}
```

## Complete Examples

### Example 1: Smart Image Classifier

```typescript
import { useModelEnhanced } from '@python-react-ml/react';

function ImageClassifier() {
  const {
    predict,
    explain,
    isReady,
    metrics,
    getPrivacyGuarantee
  } = useModelEnhanced('registry://vision/classifier@latest', {
    optimization: { autoOptimize: true },
    privacy: { localProcessingOnly: true },
    monitoring: { explainability: 'grad-cam' }
  });

  const handleImage = async (image) => {
    const result = await predict(image);
    const explanation = await explain(image);
    
    console.log('Result:', result);
    console.log('Explanation:', explanation);
  };

  return (
    <div>
      {isReady && <input type="file" onChange={handleImage} />}
      {metrics && <p>Latency: {metrics.latency}ms</p>}
    </div>
  );
}
```

### Example 2: Real-Time Video Processing

```typescript
function VideoProcessor() {
  const { predictSync, isReady } = useModelEnhanced(
    'registry://vision/detector@latest',
    {
      realtime: {
        latencyBudget: 16,
        frameSkipping: 'adaptive'
      },
      optimization: {
        quantization: 'int8'
      }
    }
  );

  const processFrame = (frameData) => {
    if (!isReady) return;
    const result = predictSync(frameData); // Synchronous for real-time
    // Use result immediately
  };

  return (
    <video onPlay={(e) => {
      // Process video frames
      setInterval(() => processFrame(getFrame(e.target)), 16);
    }} />
  );
}
```

## Key Features

### 1. **Device-Aware Optimization**
- Automatically detects GPU (WebGPU/WebGL), CPU cores, memory
- Selects optimal runtime (WebGPU > ONNX > TensorFlow.js > Pyodide)
- Chooses best quantization (int8, fp16, mixed precision)

### 2. **Privacy-First**
- Local-only processing (no data leaves device)
- Differential privacy with configurable ε
- Encrypted inference
- Memory clearing after inference

### 3. **Explainability**
- Grad-CAM: Visual attention maps
- SHAP: Feature importance
- LIME: Local explanations
- Integrated Gradients: Attribution analysis
- Attention Visualization: For transformer models

### 4. **Performance Monitoring**
- Real-time latency tracking
- Memory usage profiling
- Throughput metrics
- Drift detection (K-S test, PSI)
- Layer-by-layer profiling

### 5. **Real-Time Support**
- Synchronous predictions for low latency
- Frame skipping for video processing
- Prediction queues with FIFO/LIFO/priority
- Adaptive quality/speed trade-offs

## Type Safety

All Phase 2.5 features are fully typed:

```typescript
import type {
  UseModelEnhancedOptions,
  UseModelEnhancedResult,
  InferenceMetrics,
  ModelExplanation,
  DeviceCapabilities,
  PrivacyOptions,
  MonitoringOptions,
  RealtimeOptions
} from '@python-react-ml/react';
```

## Migration from Phase 2

Phase 2.5 is fully backward compatible. To migrate:

1. **No changes required**: Existing `useModel` code continues to work
2. **Add Phase 2.5 features**: Just add new options to your existing hooks
3. **Use new methods**: Access `explain()`, `profile()`, `optimize()` etc.

```typescript
// Phase 2 (still works)
const { predict } = useModel(url);

// Phase 2.5 (enhanced)
const { predict, explain, optimize } = useModelEnhanced(url, {
  optimization: { autoOptimize: true }
});
```

## Performance

Phase 2.5 introduces significant performance improvements:

- **WebGPU**: 5-10x faster than WebGL on compatible devices
- **Auto-Optimization**: 2-3x faster by selecting optimal runtime
- **Quantization**: 2-4x memory reduction with minimal accuracy loss
- **Caching**: Near-instant repeated predictions

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| WebGPU | 113+ | ⏳ | ⏳ | 113+ |
| ONNX Runtime | ✅ | ✅ | ✅ | ✅ |
| TensorFlow.js | ✅ | ✅ | ✅ | ✅ |
| Differential Privacy | ✅ | ✅ | ✅ | ✅ |
| Explainability | ✅ | ✅ | ✅ | ✅ |

## Best Practices

### 1. Enable Auto-Optimization

Always use auto-optimization for best performance:

```typescript
optimization: { autoOptimize: true }
```

### 2. Set Appropriate Privacy Levels

Balance privacy and functionality:

```typescript
// High privacy (recommended for sensitive data)
privacy: {
  localProcessingOnly: true,
  differentialPrivacy: { enabled: true, epsilon: 1.0 }
}

// Standard (good for most cases)
privacy: {
  localProcessingOnly: true
}
```

### 3. Monitor Performance

Track metrics to identify issues:

```typescript
const { metrics } = useModelEnhanced(url, {
  monitoring: { profiling: true }
});

useEffect(() => {
  if (metrics && metrics.latency > 100) {
    console.warn('High latency detected');
  }
}, [metrics]);
```

### 4. Use Explainability for Debugging

Understand model behavior:

```typescript
const explanation = await explain(input, 'grad-cam');
console.log('Top features:', explanation.explanation.featureImportance);
```

### 5. Real-Time Mode for Video

Use synchronous predictions for video:

```typescript
const { predictSync } = useModelEnhanced(url, {
  realtime: {
    latencyBudget: 16,
    frameSkipping: 'adaptive'
  }
});
```

## Troubleshooting

### High Latency

1. Enable auto-optimization
2. Use quantization (int8 or fp16)
3. Enable frame skipping for video
4. Check device capabilities

### Memory Issues

1. Set memory budget: `memoryBudget: 256`
2. Enable memory clearing: `clearMemoryAfter: true`
3. Use aggressive quantization
4. Reduce model size with compression

### Privacy Concerns

1. Enable local processing: `localProcessingOnly: true`
2. Add differential privacy: `differentialPrivacy: { enabled: true }`
3. Disable telemetry: `noTelemetry: true`
4. Use encrypted inference: `encryptedInference: true`

## Next Steps

- **Try the Examples**: See `examples/phase2.5-complete.tsx`
- **Read the Core Docs**: See `PHASE-2.5-README.md`
- **Explore TypeScript Types**: Full IntelliSense support
- **Join the Community**: GitHub Discussions

## Resources

- [Phase 2.5 Core Documentation](../PHASE-2.5-README.md)
- [Complete Examples](../examples/phase2.5-complete.tsx)
- [Type Definitions](../packages/core/src/types-phase2.5.ts)
- [API Reference](../docs/api-reference.md)
