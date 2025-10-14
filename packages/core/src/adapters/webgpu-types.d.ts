/**
 * WebGPU Type Declarations
 * 
 * Minimal type definitions for WebGPU support.
 * In production, use @webgpu/types package for full type definitions.
 */

declare global {
  interface Navigator {
    gpu?: any; // GPU
  }
}

export {}; // Make this a module
