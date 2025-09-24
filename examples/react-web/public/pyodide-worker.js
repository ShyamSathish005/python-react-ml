// Web Worker for Pyodide Python execution
// This worker runs Python code in isolation to prevent blocking the main thread

let pyodide;
const loadedModels = new Map();

// Initialize Pyodide
async function initializePyodide(pyodideUrl) {
  try {
    // Import Pyodide
    importScripts(pyodideUrl);
    
    pyodide = await loadPyodide({
      indexURL: pyodideUrl.replace('/pyodide.js', '/'),
    });

    // Install common ML packages
    await pyodide.loadPackage(['numpy', 'pandas', 'scikit-learn']);
    
    postMessage({ type: 'initialized' });
  } catch (error) {
    postMessage({ type: 'error', error: error.message });
  }
}

// Load a Python model
async function loadModel(bundle) {
  try {
    const modelId = Math.random().toString(36).substring(2);
    
    // Install additional dependencies if specified
    if (bundle.manifest.dependencies) {
      await pyodide.loadPackage(bundle.manifest.dependencies);
    }

    // Create a namespace for this model
    pyodide.runPython(`
import sys
import json
from io import StringIO

# Model namespace
model_${modelId} = {}
`);

    // Load additional files into the Python environment
    if (bundle.files) {
      for (const [filename, content] of Object.entries(bundle.files)) {
        if (filename.endsWith('.pkl') || filename.endsWith('.joblib')) {
          // Handle binary files (pickle/joblib models)
          pyodide.FS.writeFile(filename, new Uint8Array(content));
        } else {
          // Handle text files
          const textContent = new TextDecoder().decode(content);
          pyodide.FS.writeFile(filename, textContent);
        }
      }
    }

    // Execute the main Python code
    pyodide.runPython(`
# Execute model code
exec('''${bundle.code}''', model_${modelId})

# Ensure required functions exist
if 'predict' not in model_${modelId}:
    raise Exception("Model must define a 'predict' function")

# Optional: get_model_info function
if 'get_model_info' not in model_${modelId}:
    model_${modelId}['get_model_info'] = lambda: {
        'name': '${bundle.manifest.name}',
        'version': '${bundle.manifest.version}',
        'loaded': True
    }
`);

    loadedModels.set(modelId, bundle.manifest);
    postMessage({ type: 'model-loaded', modelId });
  } catch (error) {
    postMessage({ type: 'error', error: error.message });
  }
}

// Execute a function on a loaded model
async function executeFunction(modelId, functionName, input, requestId) {
  try {
    if (!loadedModels.has(modelId)) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Convert input to Python
    pyodide.globals.set('input_data', input);
    
    // Execute the function
    const result = pyodide.runPython(`
import json

# Get the function from model namespace
func = model_${modelId}['${functionName}']

# Execute function
try:
    result = func(input_data)
    # Convert result to JSON-serializable format
    if hasattr(result, 'tolist'):  # numpy array
        result = result.tolist()
    elif hasattr(result, 'to_dict'):  # pandas DataFrame
        result = result.to_dict()
    result
except Exception as e:
    raise Exception(f"Error in ${functionName}: {str(e)}")
`);

    postMessage({ 
      type: 'execution-result', 
      requestId, 
      result: result.toJs({ dict_converter: Object.fromEntries })
    });
  } catch (error) {
    postMessage({ 
      type: 'execution-error', 
      requestId, 
      error: error.message 
    });
  }
}

// Clean up a model
function cleanupModel(modelId) {
  if (loadedModels.has(modelId)) {
    pyodide.runPython(`
# Clean up model namespace
if 'model_${modelId}' in globals():
    del model_${modelId}
`);
    loadedModels.delete(modelId);
  }
}

// Message handler
self.onmessage = async function(e) {
  const { type, ...data } = e.data;

  switch (type) {
    case 'init':
      await initializePyodide(data.pyodideUrl);
      break;
      
    case 'load-model':
      await loadModel(data.bundle);
      break;
      
    case 'execute':
      await executeFunction(data.modelId, data.functionName, data.input, data.requestId);
      break;
      
    case 'cleanup-model':
      cleanupModel(data.modelId);
      break;
      
    default:
      postMessage({ type: 'error', error: `Unknown message type: ${type}` });
  }
};