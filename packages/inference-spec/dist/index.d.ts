interface InferenceJob {
    id: string;
    modelId: string;
    tier: 'local-gpu' | 'local-cpu' | 'cloud' | 'auto';
    input: unknown;
}
interface InferenceResult<T = unknown> {
    jobId: string;
    data: T;
    metrics: {
        latencyMs: number;
        memoryUsageMb?: number;
    };
}

interface DeviceCapabilities {
    hasWebGPU: boolean;
    estimatedFlops?: number;
    isLowPowerMode: boolean;
}

interface IInferenceEngine {
    init(): Promise<void>;
    run(job: InferenceJob): Promise<InferenceResult>;
    terminate(): Promise<void>;
}

export { DeviceCapabilities, IInferenceEngine, InferenceJob, InferenceResult };
