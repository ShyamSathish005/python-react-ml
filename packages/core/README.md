# python-react-ml

Run Python ML models directly in React and React Native apps - no backend required!

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
  const { model, isLoading, error, runInference } = useModel('/path/to/model.bundle');
  
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