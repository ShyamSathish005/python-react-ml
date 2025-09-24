// src/hooks/useModel.ts
import { useState, useEffect, useCallback } from "react";
import { PythonReactML } from "@python-react-ml/core";
function useModel(modelUrl) {
  const [model, setModel] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const engine = new PythonReactML({ platform: "web" });
  const loadModel = useCallback(async () => {
    if (!modelUrl)
      return;
    setStatus("loading");
    setError(null);
    try {
      const loadedModel = await engine.loadModelFromBundle(modelUrl);
      setModel(loadedModel);
      setStatus("ready");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load model";
      setError(errorMessage);
      setStatus("error");
      console.error("Model loading failed:", err);
    }
  }, [modelUrl]);
  const predict = useCallback(async (input) => {
    if (!model) {
      throw new Error("Model not loaded");
    }
    return await model.predict(input);
  }, [model]);
  const reload = useCallback(async () => {
    setModel(null);
    await loadModel();
  }, [loadModel]);
  useEffect(() => {
    if (modelUrl) {
      loadModel();
    }
    return () => {
      if (model) {
        model.cleanup?.();
      }
      engine.cleanup();
    };
  }, [modelUrl, loadModel]);
  return {
    model,
    status,
    error,
    predict,
    reload
  };
}

// src/hooks/usePythonEngine.ts
import { useState as useState2, useEffect as useEffect2, useCallback as useCallback2, useRef } from "react";
import { PythonReactML as PythonReactML2 } from "@python-react-ml/core";
function usePythonEngine(options = {}) {
  const [state, setState] = useState2({
    engine: null,
    isInitialized: false,
    isLoading: false,
    error: null
  });
  const engineRef = useRef(null);
  const initialize = useCallback2(async () => {
    if (engineRef.current)
      return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const engine = new PythonReactML2({
        platform: "web",
        pyodideUrl: options.pyodideUrl,
        enableLogging: options.enableLogging
      });
      engineRef.current = engine;
      setState((prev) => ({
        ...prev,
        engine,
        isInitialized: true,
        isLoading: false
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to initialize Python engine";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
      console.error("Python engine initialization failed:", err);
    }
  }, [options.pyodideUrl, options.enableLogging]);
  const cleanup = useCallback2(async () => {
    if (engineRef.current) {
      await engineRef.current.cleanup();
      engineRef.current = null;
    }
    setState({
      engine: null,
      isInitialized: false,
      isLoading: false,
      error: null
    });
  }, []);
  useEffect2(() => {
    initialize();
    return () => {
      cleanup();
    };
  }, [initialize]);
  return {
    ...state,
    initialize,
    cleanup
  };
}

// src/components/PythonModelProvider.tsx
import { createContext, useContext, useState as useState3, useEffect as useEffect3 } from "react";
import { PythonReactML as PythonReactML3 } from "@python-react-ml/core";
import { jsx } from "react/jsx-runtime";
var ModelContext = createContext(void 0);
function PythonModelProvider({
  children,
  pyodideUrl,
  enableLogging = false
}) {
  const [engine] = useState3(() => new PythonReactML3({
    platform: "web",
    pyodideUrl,
    enableLogging
  }));
  const [isInitialized, setIsInitialized] = useState3(false);
  const [error, setError] = useState3(null);
  const loadModel = async (url) => {
    try {
      setError(null);
      return await engine.loadModelFromBundle(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load model";
      setError(errorMessage);
      throw err;
    }
  };
  useEffect3(() => {
    setIsInitialized(true);
    return () => {
      engine.cleanup();
    };
  }, [engine]);
  const contextValue = {
    engine,
    loadModel,
    isInitialized,
    error
  };
  return /* @__PURE__ */ jsx(ModelContext.Provider, { value: contextValue, children });
}
function useModelContext() {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error("useModelContext must be used within a PythonModelProvider");
  }
  return context;
}

// src/components/ModelLoader.tsx
import { useEffect as useEffect4 } from "react";
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
function ModelLoader({
  modelUrl,
  onLoad,
  onError,
  children
}) {
  const modelResult = useModel(modelUrl);
  useEffect4(() => {
    if (modelResult.status === "ready" && modelResult.model && onLoad) {
      onLoad(modelResult.model);
    }
  }, [modelResult.status, modelResult.model, onLoad]);
  useEffect4(() => {
    if (modelResult.status === "error" && modelResult.error && onError) {
      onError(new Error(modelResult.error));
    }
  }, [modelResult.status, modelResult.error, onError]);
  if (children) {
    return /* @__PURE__ */ jsx2(Fragment, { children: children(modelResult) });
  }
  switch (modelResult.status) {
    case "loading":
      return /* @__PURE__ */ jsx2("div", { children: "Loading Python model..." });
    case "error":
      return /* @__PURE__ */ jsxs("div", { children: [
        "Error loading model: ",
        modelResult.error
      ] });
    case "ready":
      return /* @__PURE__ */ jsx2("div", { children: "Model loaded successfully" });
    default:
      return /* @__PURE__ */ jsx2("div", { children: "Initializing..." });
  }
}
export {
  ModelLoader,
  PythonModelProvider,
  useModel,
  useModelContext,
  usePythonEngine
};
