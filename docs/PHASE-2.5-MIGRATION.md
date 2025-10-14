# Phase 2.5 Migration & Upgrade Guide

Complete guide for upgrading from Phase 2 to Phase 2.5 or integrating Phase 2.5 into existing projects.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Breaking Changes](#breaking-changes)
3. [New Features](#new-features)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Feature-by-Feature Guide](#feature-by-feature-guide)
6. [Performance Tuning](#performance-tuning)
7. [Troubleshooting](#troubleshooting)

## Quick Start

### For New Projects

```bash
# Install packages
npm install @python-react-ml/core @python-react-ml/react

# Use Phase 2.5 features immediately
import { useModelEnhanced } from '@python-react-ml/react';
```

### For Existing Phase 2 Projects

**Good news**: Phase 2.5 is 100% backward compatible! Your existing code continues to work.

```typescript
// Phase 2 code - still works
const { predict } = useModel('model.pybundle');

// Add Phase 2.5 features gradually
const { predict, explain } = useModelEnhanced('model.pybundle', {
  optimization: { autoOptimize: true }
});
```

## Breaking Changes

**None!** Phase 2.5 is fully backward compatible with Phase 2.

However, there are some **recommended** changes:

1. **Use `useModelEnhanced` instead of `useModel`** (though both work)
2. **Enable auto-optimization** for better performance
3. **Consider privacy settings** for sensitive applications

## New Features

### 1. WebGPU Runtime
- **5-10x faster** than WebGL on supported browsers
- Automatic fallback to ONNX/TensorFlow.js

### 2. Auto-Optimization
- Detects device capabilities (GPU, CPU, memory)
- Selects optimal runtime automatically
- Chooses best quantization level

### 3. Model Registry
- Load models by name and version (like NPM)
- Automatic versioning and caching
- Marketplace support

### 4. Privacy Features
- Differential privacy (ε-differential privacy)
- Local-only processing
- Encrypted inference
- Memory clearing

### 5. Monitoring & Explainability
- Grad-CAM, SHAP, LIME, Integrated Gradients
- Real-time performance metrics
- Drift detection
- Layer profiling

### 6. Real-Time Mode
- Synchronous predictions for video processing
- Frame skipping and prediction queues
- Adaptive quality/speed trade-offs

### 7. Pipeline System
- Chain multiple models
- Parallel and sequential execution
- Smart caching and retry logic

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
# Update to latest versions
cd packages/core && npm run build
cd ../react && npm run build
```

### Step 2: Switch to Enhanced Hook

**Before (Phase 2):**
```typescript
import { useModel } from '@python-react-ml/react';

const { predict, status, error } = useModel('model.pybundle', {
  runtime: 'onnx',
  autoLoad: true
});
```

**After (Phase 2.5):**
```typescript
import { useModelEnhanced } from '@python-react-ml/react';

const { predict, status, error } = useModelEnhanced('model.pybundle', {
  runtime: 'onnx', // Still works
  autoLoad: true,  // Still works
  
  // NEW: Auto-optimization
  optimization: {
    autoOptimize: true
  }
});
```

### Step 3: Add Monitoring (Optional)

```typescript
const {
  predict,
  metrics,      // NEW
  getMetrics    // NEW
} = useModelEnhanced('model.pybundle', {
  monitoring: {
    profiling: true,
    metrics: ['latency', 'memory', 'throughput']
  }
});

// Display metrics
console.log('Avg latency:', getMetrics()?.latency);
```

### Step 4: Enable Privacy (Recommended)

```typescript
const { predict } = useModelEnhanced('model.pybundle', {
  privacy: {
    localProcessingOnly: true,  // Never send data to server
    noTelemetry: true            // No analytics
  }
});
```

### Step 5: Add Explainability (Optional)

```typescript
const { predict, explain } = useModelEnhanced('model.pybundle', {
  monitoring: {
    explainability: 'grad-cam'
  }
});

// Get explanation
const result = await predict(input);
const explanation = await explain(input);
console.log('Feature importance:', explanation.explanation);
```

## Feature-by-Feature Guide

### Auto-Optimization

**When to use**: Always! It's free performance.

**How to enable**:
```typescript
optimization: {
  autoOptimize: true,
  latencyTarget: 100,  // Target latency in ms
  memoryBudget: 512    // Max memory in MB
}
```

**What it does**:
1. Detects your device (GPU, CPU, memory)
2. Selects fastest runtime (WebGPU > ONNX > TensorFlow.js)
3. Chooses best quantization (int8, fp16, mixed)
4. Applies compression if needed

**Before/After**:
```typescript
// Before: Manual runtime selection
runtime: 'onnx'  // Might not be optimal for this device

// After: Auto-optimization
optimization: { autoOptimize: true }  // Always optimal
```

### Model Registry

**When to use**: When you have multiple models or want versioning.

**How to enable**:
```typescript
// Load model from registry
const model = useModelEnhanced('registry://vision/classifier@1.2.0', {
  registry: {
    version: '1.2.0',  // Or 'latest'
    cache: true,
    autoUpdate: true
  }
});
```

**Benefits**:
- Semantic versioning
- Automatic updates
- Model discovery
- A/B testing support

### Privacy Features

**When to use**: Applications with sensitive data (healthcare, finance, personal data).

**How to enable**:
```typescript
privacy: {
  localProcessingOnly: true,  // All processing on device
  
  differentialPrivacy: {
    enabled: true,
    epsilon: 1.0,  // Privacy budget (lower = more private)
    mechanism: 'gaussian'
  },
  
  encryptedInference: true,  // Encrypt model inputs/outputs
  clearMemoryAfter: true     // Clear memory after prediction
}
```

**Privacy Levels**:

| Level | Settings | Use Case |
|-------|----------|----------|
| **Maximum** | `localProcessingOnly: true`<br>`differentialPrivacy: { epsilon: 0.5 }`<br>`encryptedInference: true` | Healthcare, finance |
| **High** | `localProcessingOnly: true`<br>`differentialPrivacy: { epsilon: 1.0 }` | Personal data |
| **Standard** | `localProcessingOnly: true` | General applications |
| **None** | Default settings | Public data only |

### Monitoring & Explainability

**When to use**: Debugging, compliance, understanding model behavior.

**How to enable**:
```typescript
const { explain, profile } = useModelEnhanced('model.pybundle', {
  monitoring: {
    explainability: 'grad-cam',  // or 'shap', 'lime', 'attention'
    profiling: true,
    driftDetection: true
  }
});

// Get explanation
const explanation = await explain(input, 'grad-cam');

// Profile performance
const profile = await profile();
```

**Explainability Methods**:

| Method | Best For | Output |
|--------|----------|--------|
| **Grad-CAM** | Images (CNNs) | Visual attention map |
| **SHAP** | Tabular data | Feature importance |
| **LIME** | Any model | Local explanation |
| **Attention** | Transformers | Attention weights |
| **Integrated Gradients** | Any model | Attribution scores |

### Real-Time Mode

**When to use**: Video processing, gaming, live streams.

**How to enable**:
```typescript
const { predictSync } = useModelEnhanced('model.pybundle', {
  realtime: {
    latencyBudget: 16,  // 60 FPS
    frameSkipping: 'adaptive',
    predictionQueue: {
      enabled: true,
      maxSize: 10,
      strategy: 'fifo'
    }
  },
  optimization: {
    quantization: 'int8'  // Fast inference
  }
});

// Synchronous prediction for real-time
const result = predictSync(frameData);
```

**Performance Targets**:

| FPS | Latency Budget | Quantization | Frame Skipping |
|-----|----------------|--------------|----------------|
| 60 | 16ms | int8 | adaptive |
| 30 | 33ms | fp16 | none |
| 15 | 66ms | mixed-precision | none |

### Pipeline System

**When to use**: Multi-model workflows (e.g., speech → text → sentiment).

**How to enable**:
```typescript
import { createPipeline } from '@python-react-ml/core';

const pipeline = createPipeline([
  { name: 'speech-to-text', model: 'registry://audio/whisper' },
  { name: 'sentiment', model: 'registry://nlp/sentiment' },
  { name: 'response', model: 'registry://nlp/gpt' }
], {
  caching: 'smart',
  parallelism: 'auto',
  errorHandling: 'retry',
  retryAttempts: 3
});

const result = await pipeline.process(audioData);
```

## Performance Tuning

### Latency Optimization

**Goal**: Reduce prediction time

**Steps**:
1. Enable auto-optimization
2. Use int8 quantization
3. Enable WebGPU runtime
4. Reduce model size with compression

```typescript
optimization: {
  autoOptimize: true,
  latencyTarget: 50,  // ms
  quantization: 'int8',
  compressionLevel: 'aggressive'
}
```

### Memory Optimization

**Goal**: Reduce memory usage

**Steps**:
1. Set memory budget
2. Use aggressive quantization
3. Enable memory clearing
4. Use compression

```typescript
optimization: {
  memoryBudget: 256,  // MB
  quantization: 'int8',
  compressionLevel: 'aggressive'
},
privacy: {
  clearMemoryAfter: true
}
```

### Throughput Optimization

**Goal**: Process more items per second

**Steps**:
1. Enable batch processing
2. Use pipeline system
3. Enable caching
4. Use parallel processing

```typescript
realtime: {
  batchProcessing: {
    enabled: true,
    batchSize: 8
  }
}
```

## Troubleshooting

### Issue: Slow Performance

**Symptoms**: High latency, low FPS

**Solutions**:
1. Check if auto-optimization is enabled
2. Verify device supports WebGPU
3. Try int8 quantization
4. Enable frame skipping for video

```typescript
// Diagnostic
const capabilities = await autoOptimizer.getDeviceCapabilities();
console.log(capabilities);

// Fix
optimization: {
  autoOptimize: true,
  quantization: 'int8'
}
```

### Issue: High Memory Usage

**Symptoms**: Browser crashes, memory errors

**Solutions**:
1. Set memory budget
2. Use aggressive compression
3. Enable memory clearing
4. Reduce batch size

```typescript
optimization: {
  memoryBudget: 256,
  compressionLevel: 'aggressive'
},
privacy: {
  clearMemoryAfter: true
}
```

### Issue: WebGPU Not Available

**Symptoms**: Falls back to ONNX/TensorFlow.js

**Solutions**:
1. Check browser version (Chrome 113+, Edge 113+)
2. Enable WebGPU flag in browser settings
3. Update graphics drivers
4. Use fallback runtime

```typescript
// Graceful degradation
optimization: {
  autoOptimize: true,  // Automatically picks best available
  targetDevice: 'auto'
}
```

### Issue: Privacy Concerns

**Symptoms**: Data leaving device, telemetry

**Solutions**:
1. Enable local processing only
2. Add differential privacy
3. Disable telemetry
4. Verify with `getPrivacyGuarantee()`

```typescript
privacy: {
  localProcessingOnly: true,
  noTelemetry: true,
  differentialPrivacy: { enabled: true }
}

// Verify
const guarantee = getPrivacyGuarantee();
console.log('Data leaves device:', guarantee.dataLeavesDevice); // false
```

## Best Practices

### 1. Always Use Auto-Optimization

```typescript
// ✅ Good
optimization: { autoOptimize: true }

// ❌ Bad
runtime: 'onnx'  // Might not be optimal
```

### 2. Enable Privacy for Sensitive Data

```typescript
// ✅ Good - for healthcare, finance
privacy: {
  localProcessingOnly: true,
  differentialPrivacy: { enabled: true }
}
```

### 3. Monitor Performance

```typescript
// ✅ Good
const { metrics } = useModelEnhanced(url, {
  monitoring: { profiling: true }
});

useEffect(() => {
  if (metrics?.latency > 100) {
    console.warn('High latency detected');
  }
}, [metrics]);
```

### 4. Use Registry for Production

```typescript
// ✅ Good - versioned, cached
const model = useModelEnhanced('registry://vision/classifier@1.2.0');

// ❌ Bad - hard to update
const model = useModelEnhanced('/models/classifier.pybundle');
```

### 5. Test Different Explainability Methods

```typescript
// Try multiple methods to find best explanation
const gradCam = await explain(input, 'grad-cam');
const shap = await explain(input, 'shap');
const lime = await explain(input, 'lime');
```

## Migration Checklist

- [ ] Updated core and react packages
- [ ] Switched to `useModelEnhanced` hook
- [ ] Enabled auto-optimization
- [ ] Added privacy settings (if needed)
- [ ] Configured monitoring (if needed)
- [ ] Tested performance
- [ ] Updated documentation
- [ ] Trained team on new features
- [ ] Deployed to staging
- [ ] Validated in production

## Next Steps

- **Explore Examples**: See `examples/phase2.5-complete.tsx`
- **Read Core Docs**: See `PHASE-2.5-README.md`
- **Read React Docs**: See `docs/PHASE-2.5-REACT.md`
- **Join Community**: GitHub Discussions

## Support

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Q&A and community support
- **Documentation**: Comprehensive guides and API reference
