import { MicroParser } from "./MicroParser";
import { WGSLGenerator } from "./WGSLGenerator";
import { TypeScriptWrapperGenerator } from "./WrapperGenerator";

export { MicroParser, WGSLGenerator, TypeScriptWrapperGenerator };

export class Compiler {
    private parser: MicroParser;
    private wgslGenerator: WGSLGenerator;
    private wrapperGenerator: TypeScriptWrapperGenerator;

    constructor() {
        this.parser = new MicroParser();
        this.wgslGenerator = new WGSLGenerator();
        this.wrapperGenerator = new TypeScriptWrapperGenerator();
    }

    compile(pythonCode: string) {
        const parsed = this.parser.parse(pythonCode);
        const wgsl = this.wgslGenerator.generate(parsed);
        const wrapper = this.wrapperGenerator.generate(parsed, wgsl);
        return { parsed, wgsl, wrapper };
    }
}
