"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Compiler = exports.TypeScriptWrapperGenerator = exports.WGSLGenerator = exports.MicroParser = void 0;
const MicroParser_1 = require("./MicroParser");
Object.defineProperty(exports, "MicroParser", { enumerable: true, get: function () { return MicroParser_1.MicroParser; } });
const WGSLGenerator_1 = require("./WGSLGenerator");
Object.defineProperty(exports, "WGSLGenerator", { enumerable: true, get: function () { return WGSLGenerator_1.WGSLGenerator; } });
const WrapperGenerator_1 = require("./WrapperGenerator");
Object.defineProperty(exports, "TypeScriptWrapperGenerator", { enumerable: true, get: function () { return WrapperGenerator_1.TypeScriptWrapperGenerator; } });
class Compiler {
    constructor() {
        this.parser = new MicroParser_1.MicroParser();
        this.wgslGenerator = new WGSLGenerator_1.WGSLGenerator();
        this.wrapperGenerator = new WrapperGenerator_1.TypeScriptWrapperGenerator();
    }
    compile(pythonCode) {
        const parsed = this.parser.parse(pythonCode);
        const wgsl = this.wgslGenerator.generate(parsed);
        const wrapper = this.wrapperGenerator.generate(parsed, wgsl);
        return { parsed, wgsl, wrapper };
    }
}
exports.Compiler = Compiler;
