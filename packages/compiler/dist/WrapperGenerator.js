"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptWrapperGenerator = void 0;
class TypeScriptWrapperGenerator {
    generate(parsed, wgslCode) {
        const { name, args } = parsed;
        const [arg1, arg2] = args;
        // Escaping backticks for the template string inside the generated code
        const wgslCodeEscaped = wgslCode.replace(/`/g, "\\`");
        return `
export async function ${name}(${arg1}: Float32Array, ${arg2}: Float32Array): Promise<Float32Array> {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
  }
  const device = await adapter.requestDevice();

  const shaderCode = \`${wgslCodeEscaped}\`;
  const shaderModule = device.createShaderModule({
    code: shaderCode
  });

  const size = ${arg1}.byteLength; // Assuming both arrays are same size for MVP
  
  // Create buffers
  const ${arg1}Buffer = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(${arg1}Buffer.getMappedRange()).set(${arg1});
  ${arg1}Buffer.unmap();

  const ${arg2}Buffer = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(${arg2}Buffer.getMappedRange()).set(${arg2});
  ${arg2}Buffer.unmap();

  const resultBuffer = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  // Bind Group
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: ${arg1}Buffer } },
      { binding: 1, resource: { buffer: ${arg2}Buffer } },
      { binding: 2, resource: { buffer: resultBuffer } }
    ]
  });

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const computePipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: "main"
    }
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  // Dispatch: Assuming workgroup_size(64), output size / 64
  const workgroupCount = Math.ceil(${arg1}.length / 64);
  passEncoder.dispatchWorkgroups(workgroupCount);
  passEncoder.end();

  // Read back
  const gpuReadBuffer = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  commandEncoder.copyBufferToBuffer(resultBuffer, 0, gpuReadBuffer, 0, size);

  device.queue.submit([commandEncoder.finish()]);

  await gpuReadBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = gpuReadBuffer.getMappedRange();
  const result = new Float32Array(arrayBuffer.slice(0));
  gpuReadBuffer.unmap();

  return result;
}
`;
    }
}
exports.TypeScriptWrapperGenerator = TypeScriptWrapperGenerator;
