/**
 * Monitoring & Explainability Module
 * 
 * Model monitoring and interpretation:
 * - Performance profiling
 * - Explainability (SHAP, LIME, Grad-CAM)
 * - Drift detection
 * - Metrics tracking
 */

import {
  MonitoringOptions,
  InferenceMetrics,
  LayerProfile,
  ModelExplanation,
  DriftReport,
  ExplainabilityMethod
} from '../types-phase2.5';
import { PythonModel } from '../types';

export class ModelMonitor {
  private options: MonitoringOptions;
  private metricsHistory: InferenceMetrics[] = [];
  private predictionHistory: any[] = [];
  private baselineDistribution: Map<string, number[]> = new Map();

  constructor(options: MonitoringOptions = {}) {
    this.options = {
      explainability: undefined,
      profiling: false,
      driftDetection: false,
      adversarialTesting: 'none',
      logging: {
        level: 'info',
        destination: 'console'
      },
      ...options
    };
  }

  /**
   * Profile a model's layer-by-layer performance
   */
  async profileModel(model: PythonModel, input: any): Promise<LayerProfile[]> {
    if (!this.options.profiling) {
      throw new Error('Profiling not enabled');
    }

    const profiles: LayerProfile[] = [];

    // This is a simplified version - would need deep integration with runtime
    this.log('info', 'Profiling model inference...');

    const startTime = performance.now();
    await model.predict(input);
    const totalTime = performance.now() - startTime;

    // Mock layer profiles (in production, would get actual layer data)
    profiles.push({
      name: 'input_layer',
      type: 'input',
      inputShape: [1, 224, 224, 3],
      outputShape: [1, 224, 224, 3],
      parameters: 0,
      computeTime: totalTime * 0.05,
      memoryUsed: 0.6
    });

    profiles.push({
      name: 'conv1',
      type: 'conv2d',
      inputShape: [1, 224, 224, 3],
      outputShape: [1, 112, 112, 64],
      parameters: 9472,
      computeTime: totalTime * 0.2,
      memoryUsed: 3.2
    });

    profiles.push({
      name: 'dense',
      type: 'dense',
      inputShape: [1, 2048],
      outputShape: [1, 1000],
      parameters: 2049000,
      computeTime: totalTime * 0.15,
      memoryUsed: 8.2
    });

    this.log('info', `Profiling complete: ${profiles.length} layers profiled`);

    return profiles;
  }

  /**
   * Explain a model's prediction
   */
  async explainPrediction(
    model: PythonModel,
    input: any,
    prediction: any,
    method?: ExplainabilityMethod
  ): Promise<ModelExplanation> {
    const explainMethod = method || this.options.explainability;

    if (!explainMethod) {
      throw new Error('No explainability method specified');
    }

    this.log('info', `Generating explanation using ${explainMethod}`);

    switch (explainMethod) {
      case 'grad-cam':
        return this.generateGradCAM(model, input, prediction);
      
      case 'lime':
        return this.generateLIME(model, input, prediction);
      
      case 'shap':
        return this.generateSHAP(model, input, prediction);
      
      case 'attention':
        return this.generateAttention(model, input, prediction);
      
      case 'integrated-gradients':
        return this.generateIntegratedGradients(model, input, prediction);
      
      default:
        throw new Error(`Unsupported explainability method: ${explainMethod}`);
    }
  }

  /**
   * Track inference metrics
   */
  trackInference(metrics: Partial<InferenceMetrics>): void {
    const fullMetrics: InferenceMetrics = {
      latency: metrics.latency || 0,
      throughput: metrics.throughput,
      memoryUsed: metrics.memoryUsed || 0,
      gpuUtilization: metrics.gpuUtilization,
      cacheHitRate: metrics.cacheHitRate,
      errorRate: metrics.errorRate
    };

    this.metricsHistory.push(fullMetrics);

    // Keep only last 1000 metrics
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory.shift();
    }

    this.log('debug', `Tracked metrics: ${JSON.stringify(fullMetrics)}`);
  }

  /**
   * Track prediction for drift detection
   */
  trackPrediction(input: any, output: any): void {
    if (!this.options.driftDetection) {
      return;
    }

    this.predictionHistory.push({
      input,
      output,
      timestamp: Date.now()
    });

    // Keep only last 500 predictions
    if (this.predictionHistory.length > 500) {
      this.predictionHistory.shift();
    }
  }

  /**
   * Detect data or concept drift
   */
  async detectDrift(): Promise<DriftReport> {
    if (!this.options.driftDetection) {
      throw new Error('Drift detection not enabled');
    }

    if (this.predictionHistory.length < 50) {
      return {
        detected: false,
        severity: 'none',
        type: 'data-drift',
        metrics: {
          drift_score: 0
        },
        recommendations: ['Insufficient data for drift detection (minimum 50 predictions required)']
      };
    }

    // Split history into baseline and current
    const splitPoint = Math.floor(this.predictionHistory.length / 2);
    const baseline = this.predictionHistory.slice(0, splitPoint);
    const current = this.predictionHistory.slice(splitPoint);

    // Calculate drift metrics
    const ksStatistic = this.kolmogorovSmirnovTest(baseline, current);
    const psi = this.populationStabilityIndex(baseline, current);
    const driftScore = (ksStatistic + psi) / 2;

    // Determine severity
    let severity: DriftReport['severity'] = 'none';
    let detected = false;

    if (driftScore > 0.2) {
      severity = 'high';
      detected = true;
    } else if (driftScore > 0.1) {
      severity = 'medium';
      detected = true;
    } else if (driftScore > 0.05) {
      severity = 'low';
      detected = true;
    }

    const recommendations: string[] = [];
    
    if (detected) {
      recommendations.push('Consider retraining the model with recent data');
      if (severity === 'high') {
        recommendations.push('High drift detected - model may need immediate attention');
        recommendations.push('Review recent input data for anomalies');
      }
    }

    this.log('info', `Drift detection: ${severity} (score: ${driftScore.toFixed(4)})`);

    return {
      detected,
      severity,
      type: 'data-drift',
      metrics: {
        ks_statistic: ksStatistic,
        psi,
        drift_score: driftScore
      },
      recommendations
    };
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): {
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    avgMemory: number;
    avgGpuUtilization: number;
    totalInferences: number;
  } {
    if (this.metricsHistory.length === 0) {
      return {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        avgMemory: 0,
        avgGpuUtilization: 0,
        totalInferences: 0
      };
    }

    const latencies = this.metricsHistory.map(m => m.latency).sort((a, b) => a - b);
    const memories = this.metricsHistory.map(m => m.memoryUsed);
    const gpus = this.metricsHistory.filter(m => m.gpuUtilization).map(m => m.gpuUtilization!);

    return {
      avgLatency: this.average(latencies),
      p95Latency: this.percentile(latencies, 95),
      p99Latency: this.percentile(latencies, 99),
      avgMemory: this.average(memories),
      avgGpuUtilization: gpus.length > 0 ? this.average(gpus) : 0,
      totalInferences: this.metricsHistory.length
    };
  }

  /**
   * Clear monitoring history
   */
  clearHistory(): void {
    this.metricsHistory = [];
    this.predictionHistory = [];
    this.baselineDistribution.clear();
    this.log('info', 'Monitoring history cleared');
  }

  // ============================================================================
  // Explainability Methods (Simplified Implementations)
  // ============================================================================

  private async generateGradCAM(
    model: PythonModel,
    input: any,
    prediction: any
  ): Promise<ModelExplanation> {
    // Simplified Grad-CAM implementation
    // In production, would compute actual gradients
    
    const heatmap = this.generateMockHeatmap(224, 224);

    return {
      method: 'grad-cam',
      prediction,
      confidence: 0.85,
      explanation: {
        heatmap,
        topInfluences: [
          { feature: 'region_1', impact: 0.45 },
          { feature: 'region_2', impact: 0.30 },
          { feature: 'region_3', impact: 0.15 }
        ]
      }
    };
  }

  private async generateLIME(
    model: PythonModel,
    input: any,
    prediction: any
  ): Promise<ModelExplanation> {
    // Simplified LIME implementation
    
    return {
      method: 'lime',
      prediction,
      confidence: 0.82,
      explanation: {
        featureImportance: {
          'feature_1': 0.35,
          'feature_2': 0.28,
          'feature_3': 0.18,
          'feature_4': 0.12,
          'feature_5': 0.07
        },
        topInfluences: [
          { feature: 'feature_1', impact: 0.35 },
          { feature: 'feature_2', impact: 0.28 },
          { feature: 'feature_3', impact: 0.18 }
        ]
      }
    };
  }

  private async generateSHAP(
    model: PythonModel,
    input: any,
    prediction: any
  ): Promise<ModelExplanation> {
    // Simplified SHAP implementation
    
    return {
      method: 'shap',
      prediction,
      confidence: 0.88,
      explanation: {
        featureImportance: {
          'feature_1': 0.42,
          'feature_2': 0.25,
          'feature_3': 0.15,
          'feature_4': 0.10,
          'feature_5': 0.08
        },
        topInfluences: [
          { feature: 'feature_1', impact: 0.42 },
          { feature: 'feature_2', impact: 0.25 },
          { feature: 'feature_3', impact: 0.15 }
        ]
      }
    };
  }

  private async generateAttention(
    model: PythonModel,
    input: any,
    prediction: any
  ): Promise<ModelExplanation> {
    // Simplified attention visualization
    
    const attentionWeights = Array(10).fill(0).map(() => 
      Array(10).fill(0).map(() => Math.random())
    );

    return {
      method: 'attention',
      prediction,
      confidence: 0.90,
      explanation: {
        attentionWeights,
        topInfluences: [
          { feature: 'token_5', impact: 0.38 },
          { feature: 'token_8', impact: 0.32 },
          { feature: 'token_2', impact: 0.20 }
        ]
      }
    };
  }

  private async generateIntegratedGradients(
    model: PythonModel,
    input: any,
    prediction: any
  ): Promise<ModelExplanation> {
    // Simplified Integrated Gradients
    
    return {
      method: 'integrated-gradients',
      prediction,
      confidence: 0.87,
      explanation: {
        featureImportance: {
          'pixel_region_1': 0.40,
          'pixel_region_2': 0.30,
          'pixel_region_3': 0.18,
          'pixel_region_4': 0.12
        },
        topInfluences: [
          { feature: 'pixel_region_1', impact: 0.40 },
          { feature: 'pixel_region_2', impact: 0.30 },
          { feature: 'pixel_region_3', impact: 0.18 }
        ]
      }
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateMockHeatmap(width: number, height: number): number[][] {
    const heatmap: number[][] = [];
    
    for (let i = 0; i < height; i++) {
      const row: number[] = [];
      for (let j = 0; j < width; j++) {
        // Generate centered gaussian-like heatmap
        const dx = (j - width / 2) / (width / 4);
        const dy = (i - height / 2) / (height / 4);
        const value = Math.exp(-(dx * dx + dy * dy));
        row.push(value);
      }
      heatmap.push(row);
    }
    
    return heatmap;
  }

  private kolmogorovSmirnovTest(baseline: any[], current: any[]): number {
    // Simplified K-S test
    // In production, would use proper statistical implementation
    
    if (baseline.length === 0 || current.length === 0) {
      return 0;
    }

    // Extract numeric features for comparison
    const baselineValues = this.extractNumericFeatures(baseline);
    const currentValues = this.extractNumericFeatures(current);

    if (baselineValues.length === 0 || currentValues.length === 0) {
      return 0;
    }

    // Compute empirical CDFs and max difference
    const allValues = [...baselineValues, ...currentValues].sort((a, b) => a - b);
    let maxDiff = 0;

    for (const val of allValues) {
      const baselineCDF = baselineValues.filter(v => v <= val).length / baselineValues.length;
      const currentCDF = currentValues.filter(v => v <= val).length / currentValues.length;
      maxDiff = Math.max(maxDiff, Math.abs(baselineCDF - currentCDF));
    }

    return maxDiff;
  }

  private populationStabilityIndex(baseline: any[], current: any[]): number {
    // Simplified PSI calculation
    const baselineValues = this.extractNumericFeatures(baseline);
    const currentValues = this.extractNumericFeatures(current);

    if (baselineValues.length === 0 || currentValues.length === 0) {
      return 0;
    }

    // Create bins
    const numBins = 10;
    const min = Math.min(...baselineValues, ...currentValues);
    const max = Math.max(...baselineValues, ...currentValues);
    const binSize = (max - min) / numBins;

    let psi = 0;

    for (let i = 0; i < numBins; i++) {
      const binStart = min + i * binSize;
      const binEnd = binStart + binSize;

      const baselineCount = baselineValues.filter(v => v >= binStart && v < binEnd).length;
      const currentCount = currentValues.filter(v => v >= binStart && v < binEnd).length;

      const baselinePct = (baselineCount + 1) / (baselineValues.length + numBins); // Add-one smoothing
      const currentPct = (currentCount + 1) / (currentValues.length + numBins);

      psi += (currentPct - baselinePct) * Math.log(currentPct / baselinePct);
    }

    return Math.abs(psi);
  }

  private extractNumericFeatures(data: any[]): number[] {
    const values: number[] = [];

    for (const item of data) {
      if (typeof item.output === 'number') {
        values.push(item.output);
      } else if (Array.isArray(item.output)) {
        values.push(...item.output.filter((v: any) => typeof v === 'number'));
      } else if (typeof item.output === 'object' && item.output !== null) {
        for (const val of Object.values(item.output)) {
          if (typeof val === 'number') {
            values.push(val);
          }
        }
      }
    }

    return values;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private log(level: string, message: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (this.options.logging?.destination === 'console' || this.options.logging?.destination === 'both') {
      console.log(logMessage);
    }

    // In production, would also send to remote logging service if destination is 'remote' or 'both'
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error', 'none'];
    const currentLevel = this.options.logging?.level || 'info';
    const currentIndex = levels.indexOf(currentLevel);
    const messageIndex = levels.indexOf(level);
    
    return messageIndex >= currentIndex;
  }
}

// Singleton instance
export const modelMonitor = new ModelMonitor();
