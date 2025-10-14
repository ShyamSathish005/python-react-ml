/**
 * Pipeline System
 * 
 * Chain multiple models together:
 * - Sequential and parallel execution
 * - Streaming support
 * - Smart caching
 * - Error handling
 * - Multi-modal workflows
 */

import {
  PipelineStage,
  PipelineOptions,
  PipelineResult,
  StreamingPipelineResult,
  ExtendedRuntimeType
} from '../types-phase2.5';
import { PythonModel } from '../types';
import { RuntimeAdapterFactory } from '../adapters/factory';

interface LoadedStage {
  name: string;
  model: PythonModel;
  transform?: (input: any) => any;
  cache?: boolean;
  parallel?: boolean;
}

export class ModelPipeline {
  private stages: LoadedStage[] = [];
  private cache: Map<string, any> = new Map();
  private options: PipelineOptions;
  private factory: RuntimeAdapterFactory;

  constructor(
    stages: PipelineStage[],
    options: PipelineOptions = {}
  ) {
    this.options = {
      streaming: false,
      caching: 'smart',
      parallelism: 'sequential',
      errorHandling: 'fail-fast',
      retryAttempts: 0,
      timeout: 30000,
      ...options
    };

    this.factory = new RuntimeAdapterFactory();
  }

  /**
   * Initialize the pipeline by loading all models
   */
  async initialize(stageConfigs: PipelineStage[]): Promise<void> {
    console.log(`Initializing pipeline with ${stageConfigs.length} stages`);

    for (const config of stageConfigs) {
      const model = typeof config.model === 'string'
        ? await this.loadModel(config.model, config.runtime)
        : config.model;

      this.stages.push({
        name: config.name,
        model,
        transform: config.transform,
        cache: config.cache ?? (this.options.caching !== 'none'),
        parallel: config.parallel ?? false
      });
    }

    console.log('Pipeline initialized successfully');
  }

  /**
   * Process input through the entire pipeline
   */
  async process<T = any>(input: any): Promise<PipelineResult<T>> {
    const startTime = performance.now();
    const outputs: T[] = [];
    const timings: Record<string, number> = {};
    const errors: any[] = [];
    let cacheHits = 0;

    try {
      let currentInput = input;

      for (const stage of this.stages) {
        const stageStartTime = performance.now();

        try {
          // Check cache
          const cacheKey = this.getCacheKey(stage.name, currentInput);
          
          if (stage.cache && this.cache.has(cacheKey)) {
            console.log(`Cache hit for stage: ${stage.name}`);
            currentInput = this.cache.get(cacheKey);
            cacheHits++;
          } else {
            // Apply transform if provided
            const stageInput = stage.transform 
              ? stage.transform(currentInput) 
              : currentInput;

            // Run inference
            currentInput = await this.runStageWithRetry(stage, stageInput);

            // Cache result
            if (stage.cache) {
              this.setCacheEntry(cacheKey, currentInput);
            }
          }

          outputs.push(currentInput);
          timings[stage.name] = performance.now() - stageStartTime;

        } catch (error: any) {
          errors.push({
            stage: stage.name,
            error: error.message,
            timestamp: new Date().toISOString()
          });

          if (this.options.errorHandling === 'fail-fast') {
            throw error;
          }

          // For 'continue' mode, pass previous output
          if (this.options.errorHandling === 'continue') {
            console.warn(`Stage ${stage.name} failed, continuing...`);
            outputs.push(currentInput);
            timings[stage.name] = performance.now() - stageStartTime;
          }
        }
      }

      return {
        outputs,
        metadata: {
          stages: this.stages.map(s => s.name),
          timings,
          cacheHits,
          errors
        }
      };

    } catch (error: any) {
      throw new Error(`Pipeline execution failed: ${error.message}`);
    }
  }

  /**
   * Process input as a stream
   */
  async *processStream<T = any>(input: any): AsyncIterableIterator<{
    stage: string;
    output: T;
    timing: number;
  }> {
    let currentInput = input;

    for (const stage of this.stages) {
      const stageStartTime = performance.now();

      try {
        // Apply transform if provided
        const stageInput = stage.transform 
          ? stage.transform(currentInput) 
          : currentInput;

        // Run inference
        currentInput = await this.runStageWithRetry(stage, stageInput);

        const timing = performance.now() - stageStartTime;

        yield {
          stage: stage.name,
          output: currentInput,
          timing
        };

      } catch (error: any) {
        if (this.options.errorHandling === 'fail-fast') {
          throw error;
        }
        
        console.warn(`Stage ${stage.name} failed in streaming mode`);
      }
    }
  }

  /**
   * Get streaming pipeline result
   */
  async getStreamingResult<T = any>(input: any): Promise<StreamingPipelineResult<T>> {
    return {
      stream: this.processStream<T>(input) as AsyncIterableIterator<T>,
      metadata: {
        stages: this.stages.map(s => s.name),
        currentStage: this.stages[0]?.name || ''
      }
    };
  }

  /**
   * Process batch of inputs
   */
  async processBatch<T = any>(inputs: any[]): Promise<PipelineResult<T>[]> {
    if (this.options.parallelism === 'parallel') {
      return Promise.all(inputs.map(input => this.process<T>(input)));
    } else {
      const results: PipelineResult<T>[] = [];
      for (const input of inputs) {
        results.push(await this.process<T>(input));
      }
      return results;
    }
  }

  /**
   * Clear pipeline cache
   */
  clearCache(stage?: string): void {
    if (stage) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${stage}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats(): {
    stages: number;
    cacheSize: number;
    cacheKeys: number;
  } {
    return {
      stages: this.stages.length,
      cacheSize: this.getCacheSize(),
      cacheKeys: this.cache.size
    };
  }

  /**
   * Unload all models and cleanup
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up pipeline...');
    
    for (const stage of this.stages) {
      if (stage.model.cleanup) {
        await stage.model.cleanup();
      }
    }

    this.stages = [];
    this.cache.clear();
    
    console.log('Pipeline cleaned up');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async loadModel(modelPath: string, runtime?: ExtendedRuntimeType): Promise<PythonModel> {
    // This would integrate with the model registry and adapter factory
    // For now, throw an error indicating this needs to be implemented
    throw new Error(`Model loading not yet implemented for: ${modelPath}`);
  }

  private async runStageWithRetry(stage: LoadedStage, input: any): Promise<any> {
    let lastError: Error | null = null;
    const maxAttempts = (this.options.retryAttempts || 0) + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt} for stage: ${stage.name}`);
        }

        // Create promise with timeout
        const predictionPromise = stage.model.predict(input);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Stage timeout')), this.options.timeout);
        });

        const result = await Promise.race([predictionPromise, timeoutPromise]);
        return result;

      } catch (error: any) {
        lastError = error;
        
        if (attempt < maxAttempts - 1) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`Stage ${stage.name} failed`);
  }

  private getCacheKey(stageName: string, input: any): string {
    // Create a cache key from stage name and input
    // In production, would use a proper hash function
    const inputStr = JSON.stringify(input).substring(0, 100);
    return `${stageName}:${this.simpleHash(inputStr)}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  private setCacheEntry(key: string, value: any): void {
    // Implement cache size limit based on strategy
    const maxCacheSize = this.getMaxCacheSize();
    
    if (this.cache.size >= maxCacheSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  private getMaxCacheSize(): number {
    switch (this.options.caching) {
      case 'aggressive':
        return 1000;
      case 'smart':
        return 100;
      case 'none':
        return 0;
      default:
        return 100;
    }
  }

  private getCacheSize(): number {
    let size = 0;
    
    for (const value of this.cache.values()) {
      try {
        size += JSON.stringify(value).length;
      } catch (e) {
        // Skip non-serializable values
      }
    }

    return size;
  }
}

/**
 * Helper function to create a pipeline
 */
export function createPipeline(
  stages: PipelineStage[],
  options?: PipelineOptions
): ModelPipeline {
  return new ModelPipeline(stages, options);
}

/**
 * Helper hook for React components
 */
export function usePipeline(
  stages: PipelineStage[],
  options?: PipelineOptions
) {
  // This would be implemented in the React package
  throw new Error('usePipeline must be used from @python-react-ml/react package');
}
