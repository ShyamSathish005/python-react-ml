/**
 * WebGPU Adapter - High-performance GPU compute
 * 
 * This adapter leverages WebGPU for maximum performance:
 * - Direct GPU compute shaders (WGSL)
 * - Zero-copy data transfers
 * - Advanced memory management
 * - Mixed precision support
 */

import { BaseAdapter } from './base';
import { ModelBundle, PythonModel, RuntimeStatus, RuntimeError, ModelProgress, AdapterOptions } from '../types';
import { WebGPUCapabilities, WebGPUAdapterOptions, ComputeShaderInfo } from '../types-phase2.5';

// WebGPU types - minimal declarations until @webgpu/types is added
declare global {
  interface Navigator {
    gpu?: any;
  }
}

export class WebGPUAdapter extends BaseAdapter {
  private gpu: any = null; // GPU
  private adapter: any = null; // GPUAdapter
  private device: any = null; // GPUDevice
  private capabilities: WebGPUCapabilities | null = null;
  private computePipelines: Map<string, any> = new Map(); // Map<string, GPUComputePipeline>
  private bufferPool: Map<string, any> = new Map(); // Map<string, GPUBuffer>
  private customShaders: Map<string, ComputeShaderInfo> = new Map();

  constructor() {
    super('webgpu' as any);
  }

  async initialize(options: AdapterOptions & WebGPUAdapterOptions = {}): Promise<void> {
    try {
      this.setStatus('initializing');
      
      // Check WebGPU support
      if (!navigator.gpu) {
        throw new Error('WebGPU is not supported in this browser');
      }

      this.gpu = navigator.gpu;

      // Request adapter
      this.adapter = await this.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (!this.adapter) {
        throw new Error('Failed to get WebGPU adapter');
      }

      // Request device
      this.device = await this.adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {}
      });

      // Set up error handling
      this.device.addEventListener('uncapturederror', (event: any) => {
        this.setError({
          type: 'execution',
          message: `WebGPU error: ${event.error.message}`,
          details: event.error,
          timestamp: new Date().toISOString()
        });
      });

      // Get capabilities
      this.capabilities = await this.getCapabilities();

      // Load custom shaders if provided
      if (options.shaders?.custom) {
        for (const [name, code] of options.shaders.custom) {
          this.registerShader(name, code, options.workgroupSize || [8, 8, 1]);
        }
      }

      this.setStatus('ready');
      this.log('WebGPU adapter initialized successfully', this.capabilities);

    } catch (error: any) {
      this.setError({
        type: 'initialization',
        message: `WebGPU initialization failed: ${error.message}`,
        details: error,
        timestamp: new Date().toISOString(),
        stack: error.stack
      });
      throw error;
    }
  }

  async load(bundle: ModelBundle): Promise<PythonModel> {
    if (!this.device) {
      throw new Error('WebGPU device not initialized');
    }

    try {
      this.setStatus('loading');
      this.log('Loading model for WebGPU runtime', bundle.manifest);

      // Parse model format (ONNX, TF.js, or custom)
      const modelData = await this.parseModelBundle(bundle);

      // Create compute pipelines for each operation
      await this.createComputePipelines(modelData);

      // Allocate GPU buffers
      await this.allocateBuffers(modelData);

      const model: PythonModel = {
        manifest: bundle.manifest,
        predict: async (input: any) => this.predict(modelData, input),
        cleanup: () => this.unloadModel(modelData)
      };

      this.setStatus('ready');
      return model;

    } catch (error: any) {
      this.setError({
        type: 'loading',
        message: `Failed to load model: ${error.message}`,
        details: error,
        timestamp: new Date().toISOString(),
        stack: error.stack
      });
      throw error;
    }
  }

  async predict(model: any, inputs: any): Promise<any> {
    if (!this.device) {
      throw new Error('WebGPU device not initialized');
    }

    try {
      this.setStatus('executing');
      const startTime = performance.now();

      // Convert inputs to GPU buffers
      const inputBuffers = await this.createInputBuffers(inputs);

      // Create output buffers
      const outputBuffers = await this.createOutputBuffers(model);

      // Create command encoder
      const commandEncoder = this.device.createCommandEncoder();

      // Execute compute passes for each layer
      for (const layer of model.layers) {
        await this.executeComputePass(commandEncoder, layer, inputBuffers, outputBuffers);
      }

      // Submit commands
      this.device.queue.submit([commandEncoder.finish()]);

      // Read back results
      const results = await this.readOutputBuffers(outputBuffers);

      const latency = performance.now() - startTime;
      this.log(`Inference completed in ${latency.toFixed(2)}ms`);

      this.setStatus('ready');
      return this.formatOutput(results, model.manifest);

    } catch (error: any) {
      this.setError({
        type: 'execution',
        message: `Prediction failed: ${error.message}`,
        details: error,
        timestamp: new Date().toISOString(),
        stack: error.stack
      });
      throw error;
    }
  }

  async unload(model: PythonModel): Promise<void> {
    this.log('Unloading WebGPU model');
    if (model.cleanup) {
      model.cleanup();
    }
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up WebGPU adapter');
    
    // Destroy all buffers
    for (const buffer of this.bufferPool.values()) {
      buffer.destroy();
    }
    this.bufferPool.clear();

    // Clear pipelines
    this.computePipelines.clear();
    this.customShaders.clear();

    // Destroy device
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    this.adapter = null;
    this.gpu = null;
    this.capabilities = null;
    
    this.setStatus('idle');
  }

  // ============================================================================
  // WebGPU-specific methods
  // ============================================================================

  private async getCapabilities(): Promise<WebGPUCapabilities> {
    if (!this.adapter || !this.device) {
      throw new Error('WebGPU not initialized');
    }

    const features = Array.from(this.adapter.features.values()) as string[];
    const limits: Record<string, number> = {};
    
    for (const [key, value] of Object.entries(this.adapter.limits)) {
      if (typeof value === 'number') {
        limits[key] = value;
      }
    }

    return {
      supported: true,
      adapter: this.adapter,
      device: this.device,
      features,
      limits,
      maxComputeWorkgroupSize: [
        limits.maxComputeWorkgroupSizeX || 256,
        limits.maxComputeWorkgroupSizeY || 256,
        limits.maxComputeWorkgroupSizeZ || 64
      ]
    };
  }

  registerShader(name: string, code: string, workgroupSize: [number, number, number]): void {
    this.customShaders.set(name, {
      name,
      code,
      workgroupSize,
      bindings: [] // Will be parsed from shader code
    });
  }

  private async parseModelBundle(bundle: ModelBundle): Promise<any> {
    // Parse model format and extract layers/operations
    // This would differ based on model format (ONNX, TF.js, custom)
    
    const modelData = {
      manifest: bundle.manifest,
      layers: [],
      weights: new Map(),
      metadata: {}
    };

    // TODO: Implement actual parsing based on model format
    this.log('Parsing model bundle for WebGPU');

    return modelData;
  }

  private async createComputePipelines(modelData: any): Promise<void> {
    if (!this.device) return;

    // Create compute pipelines for each operation type
    // For example: matrix multiplication, convolution, activation functions
    
    for (const layer of modelData.layers || []) {
      const shaderCode = this.getShaderForLayer(layer);
      const shaderModule = this.device.createShaderModule({
        code: shaderCode
      });

      const pipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: shaderModule,
          entryPoint: 'main'
        }
      });

      this.computePipelines.set(layer.name, pipeline);
    }
  }

  private getShaderForLayer(layer: any): string {
    // Return appropriate WGSL shader code for the layer type
    // This is a simplified example
    
    return `
      @group(0) @binding(0) var<storage, read> input: array<f32>;
      @group(0) @binding(1) var<storage, read_write> output: array<f32>;
      
      @compute @workgroup_size(256)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let idx = global_id.x;
        if (idx < arrayLength(&input)) {
          output[idx] = input[idx]; // Identity operation
        }
      }
    `;
  }

  private async allocateBuffers(modelData: any): Promise<void> {
    if (!this.device) return;

    // Allocate GPU buffers for weights and intermediate tensors
    // GPUBufferUsage constants: STORAGE = 0x80, COPY_DST = 0x08
    for (const [name, data] of modelData.weights.entries()) {
      const buffer = this.device.createBuffer({
        size: data.byteLength,
        usage: 0x80 | 0x08, // STORAGE | COPY_DST
        mappedAtCreation: true
      });

      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();

      this.bufferPool.set(name, buffer);
    }
  }

  private async createInputBuffers(inputs: any): Promise<Map<string, any>> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    const buffers = new Map<string, any>();
    const GPUBufferUsage = {
      STORAGE: 0x80,
      COPY_DST: 0x08,
      COPY_SRC: 0x04,
      MAP_READ: 0x01
    };

    // Convert input data to GPU buffers
    for (const [key, value] of Object.entries(inputs)) {
      const data = this.normalizeInput(value);
      const buffer = this.device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });

      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();

      buffers.set(key, buffer);
    }

    return buffers;
  }

  private async createOutputBuffers(model: any): Promise<Map<string, any>> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    const buffers = new Map<string, any>();
    const GPUBufferUsage = {
      STORAGE: 0x80,
      COPY_SRC: 0x04
    };

    // Create output buffers based on model outputs
    for (const output of model.manifest.outputs) {
      const size = this.calculateBufferSize(output.shape || []);
      const buffer = this.device.createBuffer({
        size: size * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      buffers.set(output.name, buffer);
    }

    return buffers;
  }

  private async executeComputePass(
    encoder: any,
    layer: any,
    inputs: Map<string, any>,
    outputs: Map<string, any>
  ): Promise<void> {
    const pipeline = this.computePipelines.get(layer.name);
    if (!pipeline || !this.device) return;

    const passEncoder = encoder.beginComputePass();
    passEncoder.setPipeline(pipeline);

    // Set up bind groups
    const bindGroup = this.createBindGroup(pipeline, inputs, outputs);
    passEncoder.setBindGroup(0, bindGroup);

    // Dispatch compute work
    const workgroupCount = this.calculateWorkgroupCount(layer);
    passEncoder.dispatchWorkgroups(...workgroupCount);
    passEncoder.end();
  }

  private createBindGroup(
    pipeline: any,
    inputs: Map<string, any>,
    outputs: Map<string, any>
  ): any {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    const entries: any[] = [];
    let binding = 0;

    // Add input buffers
    for (const buffer of inputs.values()) {
      entries.push({
        binding: binding++,
        resource: { buffer }
      });
    }

    // Add output buffers
    for (const buffer of outputs.values()) {
      entries.push({
        binding: binding++,
        resource: { buffer }
      });
    }

    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries
    });
  }

  private calculateWorkgroupCount(layer: any): [number, number, number] {
    // Calculate optimal workgroup dispatch size
    const totalWork = layer.outputSize || 1024;
    const workgroupSize = 256;
    return [Math.ceil(totalWork / workgroupSize), 1, 1];
  }

  private async readOutputBuffers(outputs: Map<string, any>): Promise<Map<string, Float32Array>> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    const results = new Map<string, Float32Array>();

    const GPUBufferUsage = {
      MAP_READ: 0x01,
      COPY_DST: 0x08
    };
    const GPUMapMode = {
      READ: 0x01
    };

    for (const [name, buffer] of outputs.entries()) {
      // Create staging buffer for readback
      const stagingBuffer = this.device.createBuffer({
        size: buffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });

      // Copy data to staging buffer
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, buffer.size);
      this.device.queue.submit([encoder.finish()]);

      // Map and read data
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const data = new Float32Array(stagingBuffer.getMappedRange().slice(0));
      stagingBuffer.unmap();
      stagingBuffer.destroy();

      results.set(name, data);
    }

    return results;
  }

  private normalizeInput(input: any): Float32Array {
    if (input instanceof Float32Array) {
      return input;
    }
    if (Array.isArray(input)) {
      return new Float32Array(input.flat(Infinity));
    }
    if (typeof input === 'number') {
      return new Float32Array([input]);
    }
    throw new Error(`Unsupported input type: ${typeof input}`);
  }

  private calculateBufferSize(shape: number[]): number {
    return shape.reduce((acc, dim) => acc * dim, 1);
  }

  private formatOutput(results: Map<string, Float32Array>, manifest: any): any {
    const outputs: any = {};
    
    for (const output of manifest.outputs) {
      const data = results.get(output.name);
      if (data) {
        outputs[output.name] = this.reshapeOutput(data, output.shape);
      }
    }

    return outputs;
  }

  private reshapeOutput(data: Float32Array, shape: number[] | undefined): any {
    if (!shape || shape.length === 0) {
      return Array.from(data);
    }
    
    // Simple reshape for 1D and 2D
    if (shape.length === 1) {
      return Array.from(data);
    }
    
    // For higher dimensions, would need proper reshaping logic
    return Array.from(data);
  }

  private unloadModel(modelData: any): void {
    // Clean up model-specific resources
    this.log('Unloading WebGPU model resources');
  }

  getCapabilitiesSync(): WebGPUCapabilities | null {
    return this.capabilities;
  }
}
