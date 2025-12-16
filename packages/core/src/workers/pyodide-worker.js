// Enhanced Pyodide Web Worker with improved message protocol and error handling
// This worker runs Python code in isolation to prevent blocking the main thread

let pyodide = null;
const loadedModels = new Map();
let isInitialized = false;
let initializationPromise = null;

// Enhanced message sending with proper structure
function sendMessage(id, type, payload = null, error = null, progress = null) {
  const message = { id, type };
  if (payload !== null) message.payload = payload;
  if (error !== null) message.error = error;
  if (progress !== null) message.progress = progress;
  postMessage(message);
}

// Helper to map python exceptions
function mapPythonException(exceptionName) {
  if (!exceptionName) return 'RUNTIME';
  const name = exceptionName;
  if (name.includes('MemoryError')) return 'MEMORY';
  if (name.includes('ModuleNotFoundError') || name.includes('ImportError')) return 'IMPORT';
  if (name.includes('SyntaxError') || name.includes('IndentationError')) return 'SYNTAX';
  if (name.includes('TimeoutError')) return 'TIMEOUT';
  return 'RUNTIME';
}

function getSuggestion(type, message) {
  if (type === 'MEMORY') return 'Try reducing the batch size or using a quantized model.';
  if (type === 'IMPORT') return 'Ensure all dependencies are defined in the manifest.';
  if (type === 'SYNTAX') return 'Check your python code for syntax errors.';
  return undefined;
}

function createError(operationType, message, details = null) {
  let errorType = 'RUNTIME';

  if (details && details.type) {
    errorType = mapPythonException(details.type);
  } else if (operationType === 'initialization') {
    // Keep initialization errors as is or map them
    errorType = 'RUNTIME';
  }

  // Construct object compatible with ModelError
  return {
    type: errorType,
    message: message,
    pythonTraceback: details && details.traceback ? {
      type: details.type || 'Error',
      message: details.error || message,
      traceback: details.traceback
    } : undefined,
    suggestion: getSuggestion(errorType, message),
    timestamp: new Date().toISOString()
  };
}

// Initialize Pyodide with progress reporting
async function initializePyodide(id, config) {
  if (isInitialized) {
    sendMessage(id, 'initialized');
    return;
  }

  if (initializationPromise) {
    await initializationPromise;
    sendMessage(id, 'initialized');
    return;
  }

  initializationPromise = performInitialization(id, config);

  try {
    await initializationPromise;
    isInitialized = true;
    sendMessage(id, 'initialized');
  } catch (error) {
    sendMessage(id, 'error', null, createError('initialization', `Pyodide initialization failed: ${error.message}`, error));
  } finally {
    initializationPromise = null;
  }
}

async function performInitialization(id, config) {
  try {
    // Send progress updates
    sendMessage(id, 'progress', null, null, {
      status: 'downloading',
      progress: 10,
      message: 'Downloading Pyodide...'
    });

    // Import Pyodide
    importScripts(config.pyodideUrl);

    sendMessage(id, 'progress', null, null, {
      status: 'downloading',
      progress: 30,
      message: 'Loading Pyodide runtime...'
    });

    pyodide = await loadPyodide({
      indexURL: config.pyodideUrl.replace('/pyodide.js', '/'),
      stdout: config.enableLogging ? console.log : undefined,
      stderr: config.enableLogging ? console.error : undefined,
    });

    sendMessage(id, 'progress', null, null, {
      status: 'loading',
      progress: 60,
      message: 'Installing core packages...'
    });

    // Install common ML packages
    await pyodide.loadPackage(['numpy', 'pandas', 'scikit-learn']);

    // Set up error handling utilities in Python
    pyodide.runPython(`
import sys
import traceback
import json
from io import StringIO

def capture_python_error(func, *args, **kwargs):
    """Capture Python errors with full traceback"""
    try:
        return {'success': True, 'result': func(*args, **kwargs)}
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'type': type(e).__name__,
            'traceback': traceback.format_exc()
        }
`);

    sendMessage(id, 'progress', null, null, {
      status: 'ready',
      progress: 100,
      message: 'Initialization complete'
    });

  } catch (error) {
    throw new Error(`Failed to initialize Pyodide: ${error.message}`);
  }
}

// Load a Python model with enhanced error handling
async function loadModel(id, payload) {
  try {
    if (!isInitialized) {
      throw new Error('Pyodide not initialized');
    }

    const { manifest, code, files } = payload;
    const modelId = `model_${Math.random().toString(36).substring(2)}`;

    sendMessage(id, 'progress', null, null, {
      status: 'loading',
      progress: 0,
      message: 'Loading model dependencies...'
    });

    // Install additional dependencies if specified
    if (manifest.dependencies && manifest.dependencies.length > 0) {
      await pyodide.loadPackage(manifest.dependencies);
    }

    sendMessage(id, 'progress', null, null, {
      status: 'loading',
      progress: 30,
      message: 'Setting up model environment...'
    });

    // Create a namespace for this model
    pyodide.runPython(`
# Model namespace for ${modelId}
${modelId} = {}
globals()['${modelId}'] = ${modelId}
`);

    // Load additional files into the Python environment
    if (files && Object.keys(files).length > 0) {
      sendMessage(id, 'progress', null, null, {
        status: 'loading',
        progress: 50,
        message: 'Loading model files...'
      });

      for (const [filename, content] of Object.entries(files)) {
        if (filename.endsWith('.pkl') || filename.endsWith('.joblib')) {
          // Handle binary files (pickle/joblib models)
          pyodide.FS.writeFile(filename, new Uint8Array(content));
        } else {
          // Handle text files
          const textContent = typeof content === 'string' ? content : new TextDecoder().decode(content);
          pyodide.FS.writeFile(filename, textContent);
        }
      }
    }

    sendMessage(id, 'progress', null, null, {
      status: 'loading',
      progress: 70,
      message: 'Executing model code...'
    });

    // Execute the main Python code with error capture
    const executionResult = pyodide.runPython(`
capture_python_error(exec, '''${code}''', ${modelId})
`).toJs({ dict_converter: Object.fromEntries });

    if (!executionResult.success) {
      throw new Error(`Model code execution failed: ${executionResult.error}\\n${executionResult.traceback}`);
    }

    // Validate required functions
    const validationResult = pyodide.runPython(`
capture_python_error(lambda: {
    'has_predict': 'predict' in ${modelId},
    'predict_callable': callable(${modelId}.get('predict')),
    'functions': [k for k, v in ${modelId}.items() if callable(v)]
})
`).toJs({ dict_converter: Object.fromEntries });

    if (!validationResult.success) {
      throw new Error(`Model validation failed: ${validationResult.error}`);
    }

    const validation = validationResult.result;
    if (!validation.has_predict || !validation.predict_callable) {
      throw new Error("Model must define a callable 'predict' function");
    }

    // Add default get_model_info if not present
    pyodide.runPython(`
if 'get_model_info' not in ${modelId}:
    ${modelId}['get_model_info'] = lambda: {
        'name': '${manifest.name}',
        'version': '${manifest.version}',
        'entrypoint': '${manifest.entrypoint}',
        'loaded': True,
        'functions': [k for k, v in ${modelId}.items() if callable(v)]
    }
`);

    loadedModels.set(modelId, manifest);

    sendMessage(id, 'progress', null, null, {
      status: 'ready',
      progress: 100,
      message: 'Model loaded successfully'
    });

    sendMessage(id, 'loaded', { modelId, functions: validation.functions });

  } catch (error) {
    sendMessage(id, 'error', null, createError('loading', `Model loading failed: ${error.message}`, error));
  }
}

// Execute a function on a loaded model with enhanced error handling
async function executeFunction(id, payload) {
  try {
    const { modelId, functionName, input } = payload;

    if (!loadedModels.has(modelId)) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (!isInitialized) {
      throw new Error('Pyodide not initialized');
    }

    // Set input data in Python environment
    pyodide.globals.set('input_data', input);

    // Execute the function with comprehensive error handling
    const result = pyodide.runPython(`
capture_python_error(lambda: {
    'function_exists': '${functionName}' in ${modelId},
    'function_callable': callable(${modelId}.get('${functionName}')),
    'result': ${modelId}['${functionName}'](input_data) if '${functionName}' in ${modelId} and callable(${modelId}['${functionName}']) else None
})
`).toJs({ dict_converter: Object.fromEntries });

    if (!result.success) {
      throw new Error(`Python execution error: ${result.error}\\nTraceback: ${result.traceback}`);
    }

    const executionData = result.result;
    if (!executionData.function_exists) {
      throw new Error(`Function '${functionName}' not found in model`);
    }

    if (!executionData.function_callable) {
      throw new Error(`'${functionName}' is not callable`);
    }

    // Convert result to serializable format
    const finalResult = pyodide.runPython(`
result = ${modelId}['${functionName}'](input_data)

# Convert result to JSON-serializable format
if hasattr(result, 'tolist'):  # numpy array
    result = result.tolist()
elif hasattr(result, 'to_dict'):  # pandas DataFrame
    result = result.to_dict()
elif hasattr(result, '__dict__'):  # custom objects
    try:
        result = result.__dict__
    except:
        result = str(result)

result
`);

    sendMessage(id, 'predicted', {
      result: finalResult.toJs({ dict_converter: Object.fromEntries })
    });

  } catch (error) {
    sendMessage(id, 'error', null, createError('execution', `Function execution failed: ${error.message}`, {
      modelId: payload.modelId,
      functionName: payload.functionName
    }));
  }
}

// Clean up a model
function unloadModel(id, payload) {
  try {
    const { modelId } = payload;

    if (loadedModels.has(modelId)) {
      pyodide.runPython(`
# Clean up model namespace
if '${modelId}' in globals():
    del ${modelId}
`);
      loadedModels.delete(modelId);
      sendMessage(id, 'unloaded', { modelId });
    } else {
      sendMessage(id, 'error', null, createError('loading', `Model ${modelId} not found`));
    }
  } catch (error) {
    sendMessage(id, 'error', null, createError('loading', `Model cleanup failed: ${error.message}`));
  }
}

// Get runtime status
function getStatus(id) {
  sendMessage(id, 'status', {
    initialized: isInitialized,
    loadedModels: Array.from(loadedModels.keys()),
    memoryUsage: pyodide ? pyodide.runPython('sys.getsizeof(globals())') : 0
  });
}

// Enhanced message handler with proper error boundaries
self.onmessage = async function (e) {
  let messageId = 'unknown';

  try {
    const { id, type, payload } = e.data;
    messageId = id;

    if (!id) {
      throw new Error('Message ID is required');
    }

    switch (type) {
      case 'init':
        await initializePyodide(id, payload);
        break;

      case 'loadModel':
        await loadModel(id, payload);
        break;

      case 'predict':
        await executeFunction(id, payload);
        break;

      case 'unload':
        unloadModel(id, payload);
        break;

      case 'status':
        getStatus(id);
        break;

      default:
        sendMessage(id, 'error', null, createError('execution', `Unknown message type: ${type}`));
    }
  } catch (error) {
    sendMessage(messageId, 'error', null, createError('execution', `Message handling error: ${error.message}`, error));
  }
};

// Handle worker errors
self.onerror = function (error) {
  postMessage({
    id: 'worker-error',
    type: 'error',
    error: createError('initialization', `Worker error: ${error.message}`, error)
  });
};

self.onunhandledrejection = function (event) {
  postMessage({
    id: 'worker-error',
    type: 'error',
    error: createError('execution', `Unhandled promise rejection: ${event.reason}`, event.reason)
  });
};