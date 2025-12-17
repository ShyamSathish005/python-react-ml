export interface InferenceJob {
    id: string;
    modelId: string;
    tier: 'local-gpu' | 'local-cpu' | 'cloud' | 'auto';
    input: unknown; // Eventually will be TensorSpec
}

export interface InferenceResult<T = unknown> {
    jobId: string;
    data: T;
    metrics: {
        latencyMs: number;
        memoryUsageMb?: number;
    };
}
