"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WGSLGenerator = void 0;
class WGSLGenerator {
    generate(parsed) {
        const { args, op } = parsed;
        const [arg1, arg2] = args;
        // Use the actual argument names in the WGSL
        return `
@group(0) @binding(0) var<storage, read> ${arg1}: array<f32>;
@group(0) @binding(1) var<storage, read> ${arg2}: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x;
  // Safety check for array bounds
  if (index >= arrayLength(&${arg1})) { return; }
  result[index] = ${arg1}[index] ${op} ${arg2}[index];
}
`.trim();
    }
}
exports.WGSLGenerator = WGSLGenerator;
