# Python React ML

> Run Python ML models directly in React and React Native apps - no backend required!

[![npm version](https://badge.fury.io/js/@python-react-ml%2Fcore.svg)](https://badge.fury.io/js/@python-react-ml%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Python in the Browser**: Run real Python code client-side using Pyodide
- **React Integration**: Seamless hooks and components for React apps
- **React Native Support**: Native bridge for mobile applications
- **Offline-First**: No internet required after initial model load
- **Easy Bundling**: CLI tools for model packaging and deployment
- **TypeScript**: Full TypeScript support for better DX
- **Web Workers**: Non-blocking Python execution

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Packages](#packages)
- [Usage](#usage)
  - [React Web](#react-web)
  - [React Native](#react-native)
  - [CLI Tools](#cli-tools)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## 🔧 Installation

### For React Web Projects

```bash
npm install @python-react-ml/core @python-react-ml/react
```

### For React Native Projects

```bash
npm install @python-react-ml/core @python-react-ml/react-native

# iOS additional setup
cd ios && pod install
```

### CLI Tools

```bash
npm install -g @python-react-ml/cli
```

## 🚀 Quick Start

### 1. Create a Python Model

```python
# model.py
import numpy as np

def predict(input_data):
    """Main prediction function"""
    # Your ML model logic here
    features = np.array(input_data)
    # Simple linear model example
    result = np.sum(features) * 0.5
    return float(result)

def get_model_info():
    """Optional: Return model metadata"""
    return {
        "name": "My Model",
        "version": "1.0.0",
        "type": "regression"
    }
```

### 2. Bundle Your Model

```bash
python-react-ml bundle model.py -o my-model.bundle.zip
```

### 3. Use in React

```jsx
import { useModel } from '@python-react-ml/react';

function MyApp() {
  const { model, status, predict, error } = useModel('/my-model.bundle.zip');

  const handlePredict = async () => {
    if (model) {
      const result = await predict([1.0, 2.0, 3.0]);
      console.log('Prediction:', result);
    }
  };

  if (status === 'loading') return <div>Loading model...</div>;
  if (status === 'error') return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Python ML in React!</h1>
      <button onClick={handlePredict} disabled={status !== 'ready'}>
        Run Prediction
      </button>
    </div>
  );
}
```

## 📦 Packages

| Package | Description | Size |
|---------|-------------|------|
| [`@python-react-ml/core`](./packages/core) | Core Python execution engine | ![npm bundle size](https://img.shields.io/bundlephobia/minzip/@python-react-ml/core) |
| [`@python-react-ml/react`](./packages/react) | React hooks and components | ![npm bundle size](https://img.shields.io/bundlephobia/minzip/@python-react-ml/react) |
| [`@python-react-ml/react-native`](./packages/react-native) | React Native native bridge | ![npm bundle size](https://img.shields.io/bundlephobia/minzip/@python-react-ml/react-native) |
| [`@python-react-ml/cli`](./packages/cli) | CLI tools for bundling | ![npm bundle size](https://img.shields.io/bundlephobia/minzip/@python-react-ml/cli) |

## 📚 Usage

### React Web

#### Basic Hook Usage

```jsx
import { useModel } from '@python-react-ml/react';

function ModelComponent() {
  const { model, status, predict, reload } = useModel('/path/to/model.bundle.zip');

  return (
    <div>
      <p>Status: {status}</p>
      {status === 'ready' && (
        <button onClick={() => predict([1, 2, 3])}>
          Predict
        </button>
      )}
    </div>
  );
}
```

#### Provider Pattern

```jsx
import { PythonModelProvider, useModelContext } from '@python-react-ml/react';

function App() {
  return (
    <PythonModelProvider pyodideUrl="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js">
      <ModelComponent />
    </PythonModelProvider>
  );
}

function ModelComponent() {
  const { loadModel, isInitialized } = useModelContext();
  
  // Use context...
}
```

#### Component Pattern

```jsx
import { ModelLoader } from '@python-react-ml/react';

function App() {
  return (
    <ModelLoader 
      modelUrl="/model.bundle.zip"
      onLoad={(model) => console.log('Model loaded!', model)}
      onError={(error) => console.error('Load failed:', error)}
    >
      {({ status, model, predict }) => (
        <div>
          <p>Status: {status}</p>
          {status === 'ready' && (
            <button onClick={() => predict([1, 2, 3])}>
              Predict
            </button>
          )}
        </div>
      )}
    </ModelLoader>
  );
}
```

### React Native

```jsx
import { useModelNative } from '@python-react-ml/react-native';

function ModelScreen() {
  const { 
    isLoaded, 
    isLoading, 
    predict, 
    error 
  } = useModelNative('/path/to/model.bundle.zip');

  const handlePredict = async () => {
    try {
      const result = await predict([1.0, 2.0, 3.0]);
      Alert.alert('Result', `Prediction: ${result}`);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text>Model Status: {isLoading ? 'Loading...' : isLoaded ? 'Ready' : 'Not loaded'}</Text>
      {error && <Text style={styles.error}>Error: {error}</Text>}
      <TouchableOpacity 
        onPress={handlePredict} 
        disabled={!isLoaded}
        style={styles.button}
      >
        <Text>Run Prediction</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### CLI Tools

#### Initialize a New Project

```bash
python-react-ml init my-project
cd my-project
```

#### Validate Your Model

```bash
python-react-ml validate model.py
```

#### Bundle Your Model

```bash
# Basic bundling
python-react-ml bundle model.py

# Advanced options
python-react-ml bundle model.py \
  --output my-model.bundle.zip \
  --name "My Awesome Model" \
  --version "1.2.0" \
  --include data.pkl requirements.txt \
  --deps numpy pandas scikit-learn
```

## 📖 API Reference

### Core Classes

#### `PythonReactML`

Main class for Python execution.

```typescript
class PythonReactML {
  constructor(options: PythonEngineOptions)
  loadModelFromBundle(url: string): Promise<PythonModel>
  loadModelFromFile(filePath: string): Promise<PythonModel>
  cleanup(): Promise<void>
}
```

#### `PythonModel`

Represents a loaded Python model.

```typescript
interface PythonModel {
  manifest: PythonModelManifest;
  predict: (input: any) => Promise<any>;
  getInfo?: () => Promise<any>;
  cleanup?: () => void;
}
```

### React Hooks

#### `useModel(modelUrl: string)`

Hook for loading and using a Python model.

```typescript
interface UseModelResult {
  model: PythonModel | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  predict: (input: any) => Promise<any>;
  reload: () => Promise<void>;
}
```

#### `usePythonEngine(options?: UsePythonEngineOptions)`

Hook for managing the Python engine.

```typescript
interface PythonEngineState {
  engine: PythonReactML | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}
```

### CLI Commands

- `python-react-ml init [name]` - Initialize new project
- `python-react-ml bundle <entry>` - Bundle Python model
- `python-react-ml validate <entry>` - Validate model code

## 💡 Examples

Check out our [examples directory](./examples) for complete sample applications:

- **[React Web App](./examples/react-web)** - Complete web application
- **[React Native App](./examples/react-native-app)** - Mobile application
- **[Advanced Models](./examples/advanced-models)** - Complex ML models

## 🔍 How It Works

1. **Python Code**: Write your ML model in Python with a `predict()` function
2. **Bundling**: CLI tools package your Python code and dependencies into a ZIP bundle
3. **Runtime**: In the browser, Pyodide (Python compiled to WebAssembly) executes your code
4. **React Integration**: Hooks and components provide seamless integration

```mermaid
graph LR
    A[Python Model] --> B[CLI Bundle]
    B --> C[ZIP Bundle]
    C --> D[React App]
    D --> E[Pyodide/WebWorker]
    E --> F[Python Execution]
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/yourusername/python-react-ml.git
cd python-react-ml
npm install
npm run build
```

### Running Tests

```bash
npm test
```

### Releasing

```bash
npm run build
npm run publish:all
```

## ⚠️ Limitations

- **Web**: Limited to Pyodide-compatible packages (most popular ML libraries supported)
- **File Size**: Bundles can be large due to Python runtime
- **Performance**: Slightly slower than native Python (but often faster than server round-trips)
- **React Native**: Requires native bridge implementation (iOS/Android)

## 🗺️ Roadmap

- [ ] Support for TensorFlow.js integration
- [ ] Model caching and lazy loading
- [ ] Performance optimizations
- [ ] More ML framework examples
- [ ] Advanced debugging tools

## 📄 License

MIT © Shyam Sathish (https://github.com/ShyamSathish005)
MIT © Siddharth B (https://github.com/Siddharth-B)
MIT © Sathyanrayanaa. T (https://github.com/Sathyanrayanaa-T)

## Acknowledgments

- [Pyodide](https://pyodide.org/) - Python in the browser
- [React](https://reactjs.org/) - UI library
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**Made with ❤️ for developers who want to bring Python ML to the Frontend**
