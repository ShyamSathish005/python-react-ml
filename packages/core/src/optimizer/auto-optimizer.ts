/**
 * Auto-Optimization Engine
 * 
 * Intelligently optimizes models based on device capabilities:
 * - Device detection and profiling
 * - Runtime selection
 * - Quantization
 * - Compression
 * - Performance estimation
 */

import {
  DeviceCapabilities,
  OptimizationOptions,
  OptimizationResult,
  QuantizationType,
  ExtendedRuntimeType
} from '../types-phase2.5';
import { ModelBundle, PythonModelManifest } from '../types';

export class AutoOptimizer {
  private deviceCapabilities: DeviceCapabilities | null = null;

  constructor() {
    this.detectDevice();
  }

  /**
   * Detect current device capabilities
   */
  private async detectDevice(): Promise<void> {
    this.deviceCapabilities = await this.getDeviceCapabilities();
  }

  /**
   * Get comprehensive device capabilities
   */
  async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    const platform = this.detectPlatform();
    const gpu = await this.detectGPU();
    const cpu = this.detectCPU();
    const memory = await this.detectMemory();
    const network = await this.detectNetwork();
    const battery = await this.detectBattery();

    return {
      platform,
      gpu,
      cpu,
      memory,
      network,
      battery
    };
  }

  /**
   * Optimize a model based on device capabilities and options
   */
  async optimize(
    bundle: ModelBundle,
    options: OptimizationOptions = {}
  ): Promise<OptimizationResult> {
    const capabilities = options.targetDevice === 'auto' 
      ? (this.deviceCapabilities || await this.getDeviceCapabilities())
      : options.targetDevice as DeviceCapabilities;

    const originalSize = this.calculateBundleSize(bundle);
    
    // Determine optimal runtime
    const recommendedRuntime = this.selectOptimalRuntime(bundle, capabilities, options);
    
    // Apply quantization
    const quantization = this.selectQuantization(capabilities, options);
    
    // Apply compression
    const compressionLevel = options.compressionLevel || this.selectCompression(capabilities);
    
    // Estimate performance
    const estimatedLatency = this.estimateLatency(bundle, capabilities, recommendedRuntime, quantization);
    
    // Calculate transformations applied
    const transformations: string[] = [];
    if (quantization !== 'none') {
      transformations.push(`Quantization: ${quantization}`);
    }
    if (compressionLevel !== 'none') {
      transformations.push(`Compression: ${compressionLevel}`);
    }
    transformations.push(`Runtime: ${recommendedRuntime}`);

    // Simulate optimization (in production, would actually modify the bundle)
    const optimizedSize = this.calculateOptimizedSize(originalSize, quantization, compressionLevel);
    
    return {
      originalSize,
      optimizedSize,
      compressionRatio: originalSize / optimizedSize,
      estimatedLatency,
      recommendedRuntime,
      quantizationApplied: quantization,
      transformations
    };
  }

  /**
   * Select optimal runtime based on model and device
   */
  private selectOptimalRuntime(
    bundle: ModelBundle,
    capabilities: DeviceCapabilities,
    options: OptimizationOptions
  ): ExtendedRuntimeType {
    // Explicit runtime preference
    if (bundle.manifest.runtime) {
      return bundle.manifest.runtime as ExtendedRuntimeType;
    }

    // WebGPU for high-performance needs
    if (capabilities.gpu.available && capabilities.gpu.webgpu?.supported) {
      return 'webgpu';
    }

    // ONNX for heavy models on desktop
    if (capabilities.platform === 'desktop' && capabilities.memory.total > 4096) {
      return 'onnx';
    }

    // Native runtimes for mobile
    if (capabilities.platform === 'ios') {
      return 'native-ios';
    }
    if (capabilities.platform === 'android') {
      return 'native-android';
    }

    // TensorFlow.js for web with GPU
    if (capabilities.gpu.available && capabilities.platform === 'web') {
      return 'tfjs';
    }

    // Fallback to Pyodide
    return 'pyodide';
  }

  /**
   * Select optimal quantization strategy
   */
  private selectQuantization(
    capabilities: DeviceCapabilities,
    options: OptimizationOptions
  ): QuantizationType {
    if (options.quantization) {
      return options.quantization;
    }

    // No quantization for high-end devices in performance mode
    if (options.powerMode === 'performance' && capabilities.memory.total > 8192) {
      return 'none';
    }

    // Aggressive quantization for mobile or low memory
    if (capabilities.platform === 'android' || capabilities.platform === 'ios') {
      return 'int8';
    }

    if (capabilities.memory.total < 2048) {
      return 'int8';
    }

    // FP16 for GPU devices
    if (capabilities.gpu.available) {
      return 'fp16';
    }

    // Dynamic quantization for balanced approach
    return 'dynamic';
  }

  /**
   * Select compression level
   */
  private selectCompression(capabilities: DeviceCapabilities): 'none' | 'light' | 'moderate' | 'aggressive' {
    // Aggressive compression for slow networks or mobile
    if (capabilities.network.type === '4g' || capabilities.platform === 'android' || capabilities.platform === 'ios') {
      return 'aggressive';
    }

    // Moderate for wifi
    if (capabilities.network.type === 'wifi') {
      return 'moderate';
    }

    // Light for fast networks
    return 'light';
  }

  /**
   * Estimate inference latency
   */
  private estimateLatency(
    bundle: ModelBundle,
    capabilities: DeviceCapabilities,
    runtime: ExtendedRuntimeType,
    quantization: QuantizationType
  ): number {
    // Base latency (simplified model)
    let latency = 100; // ms

    // Adjust for model size (rough estimate)
    const sizeInMB = this.calculateBundleSize(bundle) / (1024 * 1024);
    latency += sizeInMB * 10;

    // Adjust for runtime
    const runtimeMultipliers: Record<ExtendedRuntimeType, number> = {
      'webgpu': 0.3,
      'native-ios': 0.4,
      'native-android': 0.5,
      'onnx': 0.6,
      'tfjs': 0.8,
      'pyodide': 1.5,
      'wasm': 1.0
    };
    latency *= runtimeMultipliers[runtime] || 1.0;

    // Adjust for quantization
    const quantizationSpeedup: Record<QuantizationType, number> = {
      'none': 1.0,
      'fp16': 0.7,
      'dynamic': 0.8,
      'int8': 0.5,
      'mixed-precision': 0.6
    };
    latency *= quantizationSpeedup[quantization] || 1.0;

    // Adjust for device capabilities
    if (!capabilities.gpu.available) {
      latency *= 2.0;
    }

    if (capabilities.cpu.cores < 4) {
      latency *= 1.5;
    }

    return Math.round(latency);
  }

  /**
   * Calculate bundle size
   */
  private calculateBundleSize(bundle: ModelBundle): number {
    let size = bundle.code.length;
    
    if (bundle.files) {
      for (const file of Object.values(bundle.files)) {
        size += file.byteLength;
      }
    }

    return size;
  }

  /**
   * Calculate optimized size after compression and quantization
   */
  private calculateOptimizedSize(
    originalSize: number,
    quantization: QuantizationType,
    compression: 'none' | 'light' | 'moderate' | 'aggressive'
  ): number {
    let size = originalSize;

    // Quantization reduction
    const quantizationReduction: Record<QuantizationType, number> = {
      'none': 1.0,
      'fp16': 0.5,
      'dynamic': 0.6,
      'int8': 0.25,
      'mixed-precision': 0.4
    };
    size *= quantizationReduction[quantization] || 1.0;

    // Compression reduction
    const compressionReduction: Record<string, number> = {
      'none': 1.0,
      'light': 0.8,
      'moderate': 0.6,
      'aggressive': 0.4
    };
    size *= compressionReduction[compression] || 1.0;

    return Math.round(size);
  }

  // ============================================================================
  // Device Detection Methods
  // ============================================================================

  private detectPlatform(): 'web' | 'ios' | 'android' | 'desktop' {
    if (typeof window === 'undefined') {
      return 'desktop';
    }

    const ua = navigator.userAgent.toLowerCase();
    
    if (/iphone|ipad|ipod/.test(ua)) {
      return 'ios';
    }
    
    if (/android/.test(ua)) {
      return 'android';
    }
    
    if (/electron/.test(ua)) {
      return 'desktop';
    }
    
    return 'web';
  }

  private async detectGPU(): Promise<DeviceCapabilities['gpu']> {
    const result: DeviceCapabilities['gpu'] = {
      available: false
    };

    // Check WebGPU
    if (typeof navigator !== 'undefined' && (navigator as any).gpu) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          result.available = true;
          result.type = this.detectGPUType();
          result.webgpu = {
            supported: true,
            adapter,
            features: Array.from((adapter as any).features || []),
            limits: {},
            maxComputeWorkgroupSize: [256, 256, 64]
          };
        }
      } catch (e) {
        // WebGPU not available
      }
    }

    // Check WebGL as fallback GPU indicator
    if (!result.available && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        result.available = true;
        result.type = 'integrated'; // assumption
      }
    }

    return result;
  }

  private detectGPUType(): 'integrated' | 'discrete' | 'apple-neural-engine' | 'qualcomm-npu' {
    const ua = navigator.userAgent.toLowerCase();
    
    if (/mac/.test(ua) && /arm/.test(ua)) {
      return 'apple-neural-engine';
    }
    
    if (/qualcomm|snapdragon/.test(ua)) {
      return 'qualcomm-npu';
    }
    
    // Default assumption
    return 'integrated';
  }

  private detectCPU(): DeviceCapabilities['cpu'] {
    const cores = typeof navigator !== 'undefined' 
      ? (navigator as any).hardwareConcurrency || 4 
      : 4;
    
    const ua = typeof navigator !== 'undefined' 
      ? navigator.userAgent.toLowerCase() 
      : '';
    
    const architecture = /arm|aarch/.test(ua) ? 'arm' : 'x86';

    return { cores, architecture };
  }

  private async detectMemory(): Promise<DeviceCapabilities['memory']> {
    // Estimate memory (browser APIs are limited)
    const memory: DeviceCapabilities['memory'] = {
      total: 4096, // Default estimate: 4GB
      available: 2048 // Default estimate: 2GB
    };

    if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
      memory.total = (navigator as any).deviceMemory * 1024; // Convert GB to MB
      memory.available = memory.total * 0.5; // Rough estimate
    }

    if ((performance as any).memory) {
      const perfMemory = (performance as any).memory;
      memory.total = perfMemory.jsHeapSizeLimit / (1024 * 1024);
      memory.available = (perfMemory.jsHeapSizeLimit - perfMemory.usedJSHeapSize) / (1024 * 1024);
    }

    return memory;
  }

  private async detectNetwork(): Promise<DeviceCapabilities['network']> {
    const network: DeviceCapabilities['network'] = {
      type: 'wifi', // Default assumption
      speed: 10 // Default: 10 Mbps
    };

    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
      const conn = (navigator as any).connection;
      
      const effectiveType = conn.effectiveType;
      if (effectiveType === '4g') network.type = '4g';
      else if (effectiveType === '5g') network.type = '5g';
      else if (effectiveType === 'wifi') network.type = 'wifi';
      
      if (conn.downlink) {
        network.speed = conn.downlink; // Mbps
      }
    }

    return network;
  }

  private async detectBattery(): Promise<DeviceCapabilities['battery'] | undefined> {
    if (typeof navigator === 'undefined' || !(navigator as any).getBattery) {
      return undefined;
    }

    try {
      const battery = await (navigator as any).getBattery();
      return {
        level: battery.level * 100,
        charging: battery.charging
      };
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Get a human-readable capabilities report
   */
  async getCapabilitiesReport(): Promise<string> {
    const caps = this.deviceCapabilities || await this.getDeviceCapabilities();
    
    return `
Device Capabilities Report
===========================
Platform: ${caps.platform}
CPU: ${caps.cpu.cores} cores (${caps.cpu.architecture})
Memory: ${caps.memory.total.toFixed(0)} MB total, ${caps.memory.available.toFixed(0)} MB available
GPU: ${caps.gpu.available ? 'Available' : 'Not available'}${caps.gpu.type ? ` (${caps.gpu.type})` : ''}
Network: ${caps.network.type}${caps.network.speed ? ` (${caps.network.speed} Mbps)` : ''}
Battery: ${caps.battery ? `${caps.battery.level.toFixed(0)}% ${caps.battery.charging ? '(charging)' : ''}` : 'N/A'}
WebGPU: ${caps.gpu.webgpu?.supported ? 'Supported' : 'Not supported'}
    `.trim();
  }
}

// Singleton instance
export const autoOptimizer = new AutoOptimizer();
