# python-react-ml

Run ML models directly in React and React Native apps with multiple runtime engines - no backend required!

**Multi-Runtime Support**: Choose between Pyodide (Python), ONNX Runtime, or TensorFlow.js for optimal performance based on your model type and requirements.

## Installation

```bash
npm install python-react-ml
```

For React apps, also install:
```bash
npm install python-react-ml-react
```

For React Native apps, also install:
```bash
npm install python-react-ml-react-native
```

## Quick Start

### React

```jsx
import { useModel } from 'python-react-ml-react';

function MyMLComponent() {
  // Python model with Pyodide runtime
  const { model, isLoading, error, runInference } = useModel('/python-model.bundle', {
    runtime: 'pyodide'
  });
  
  // Or ONNX model for high performance
  // const { model, isLoading, error, runInference } = useModel('/model.onnx', {
  //   runtime: 'onnx'
  // });
  
  // Or TensorFlow.js model with GPU acceleration  
  // const { model, isLoading, error, runInference } = useModel('/tfjs-model/', {
  //   runtime: 'tfjs',
  //   tfjsBackend: 'webgl'
  // });
  
  if (isLoading) return <div>Loading model...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  const handlePredict = async () => {
    try {
      const result = await runInference({ 
        input_data: [[1, 2, 3, 4]] 
      });
      console.log('Prediction:', result);
    } catch (err) {
      console.error('Prediction failed:', err);
    }
  };
  
  return (
    <button onClick={handlePredict}>
      Run Prediction
    </button>
  );
}
```

## Runtime Selection

Choose the optimal runtime engine for your specific model and performance requirements:

### 🐍 Pyodide Runtime
- **Use for**: Python scripts, custom ML models, data preprocessing
- **Performance**: Good, full Python ecosystem
- **Bundle size**: Large (~10MB+)
- **GPU support**: No

### ⚡ ONNX Runtime  
- **Use for**: Production models, cross-platform compatibility
- **Performance**: Excellent, optimized inference
- **Bundle size**: Small (~2-5MB)
- **GPU support**: Yes (WebGL)

### 🧠 TensorFlow.js Runtime
- **Use for**: Neural networks, TensorFlow models
- **Performance**: Excellent with GPU acceleration
- **Bundle size**: Medium (~5-8MB) 
- **GPU support**: Yes (WebGL/WebGPU)

```jsx
// Specify runtime in useModel options
const { model } = useModel('/model', {
  runtime: 'onnx',        // 'pyodide', 'onnx', or 'tfjs'
  tfjsBackend: 'webgl'    // For TensorFlow.js GPU acceleration
});
```

### React Native

```jsx
import { useModelNative } from 'python-react-ml-react-native';

function MyMLComponent() {
  const { model, isLoading, error, runInference } = useModelNative('my-model');
  
  // Same usage as React
}
```

## Features

- 🚀 **Zero Backend**: Run ML models entirely in the browser/app
- 🔒 **Privacy First**: No data leaves the device
- ⚡ **Fast**: Optimized Python runtime with Pyodide
- 📱 **Cross Platform**: Works in React web and React Native
- 🎯 **Type Safe**: Full TypeScript support
- 📦 **Easy Bundling**: CLI tools for model packaging

## Documentation

Visit the [GitHub repository](https://github.com/shyamsathish/python-react-ml) for full documentation, examples, and guides.

## License

MIT