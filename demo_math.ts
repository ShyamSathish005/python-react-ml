
export async function vector_add(a: Float32Array, b: Float32Array): Promise<Float32Array> {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
  }
  const device = await adapter.requestDevice();

  const shaderCode = `@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x;
  // Safety check for result array bounds
  if (index >= arrayLength(&result)) { return; }

  var aVal = 0.0;
  if (index < arrayLength(&a)) {
    aVal = a[index];
  }

  var bVal = 0.0;
  if (index < arrayLength(&b)) {
    bVal = b[index];
  }

  result[index] = aVal + bVal;
}`;
  const shaderModule = device.createShaderModule({
    code: shaderCode
  });

  const resultSize = Math.max(a.byteLength, b.byteLength);
  
  // Create buffers
  const aBuffer = device.createBuffer({
    size: a.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(aBuffer.getMappedRange()).set(a);
  aBuffer.unmap();

  const bBuffer = device.createBuffer({
    size: b.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(bBuffer.getMappedRange()).set(b);
  bBuffer.unmap();

  const resultBuffer = device.createBuffer({
    size: resultSize,
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
      { binding: 0, resource: { buffer: aBuffer } },
      { binding: 1, resource: { buffer: bBuffer } },
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
  // resultSize is in bytes, so divide by 4 to get element count
  const elementCount = resultSize / 4;
  const workgroupCount = Math.ceil(elementCount / 64);
  passEncoder.dispatchWorkgroups(workgroupCount);
  passEncoder.end();

  // Read back
  const gpuReadBuffer = device.createBuffer({
    size: resultSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  commandEncoder.copyBufferToBuffer(resultBuffer, 0, gpuReadBuffer, 0, resultSize);

  device.queue.submit([commandEncoder.finish()]);

  await gpuReadBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = gpuReadBuffer.getMappedRange();
  const result = new Float32Array(arrayBuffer.slice(0));
  gpuReadBuffer.unmap();

  return result;
}
