import { InferenceJob, InferenceResult } from '../types/Contract';

export interface IInferenceEngine {
    init(): Promise<void>;
    run(job: InferenceJob): Promise<InferenceResult>;
    terminate(): Promise<void>;
}
