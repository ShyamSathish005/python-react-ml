export enum PythonErrorType {
    SYNTAX = 'SYNTAX',
    IMPORT = 'IMPORT',
    RUNTIME = 'RUNTIME',
    MEMORY = 'MEMORY',
    TIMEOUT = 'TIMEOUT'
}

export interface PythonTraceback {
    type: string;
    message: string;
    traceback: string;
}

export class ModelError extends Error {
    public type: PythonErrorType;
    public pythonTraceback?: PythonTraceback;
    public suggestion?: string;

    constructor(
        type: PythonErrorType,
        message: string,
        pythonTraceback?: PythonTraceback,
        suggestion?: string
    ) {
        super(message);
        this.name = 'ModelError';
        this.type = type;
        this.pythonTraceback = pythonTraceback;
        this.suggestion = suggestion;
    }

    static fromJSON(json: any): ModelError {
        return new ModelError(
            json.type || PythonErrorType.RUNTIME,
            json.message || 'Unknown error',
            json.pythonTraceback,
            json.suggestion
        );
    }
}
