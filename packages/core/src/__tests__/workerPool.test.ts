import { WorkerPoolManager } from '../pool/workerPool';
import { PythonEngineOptions } from '../types';
import { PythonErrorType } from '../types/Errors';

describe('WorkerPoolManager Reliability', () => {
    let originalWorker: any;

    beforeAll(() => {
        originalWorker = global.Worker;
    });

    afterAll(() => {
        global.Worker = originalWorker;
    });

    beforeEach(() => {
        // Force reset singleton
        (WorkerPoolManager as any).instance = null;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should KILL the worker and throw TimeoutError if execution hangs', async () => {
        const terminateMock = jest.fn();

        // Mock Worker definition
        global.Worker = class MockWorker {
            onmessage: ((ev: any) => void) | null = null;
            onerror: ((ev: any) => void) | null = null;
            terminate = terminateMock;

            constructor(script: string) { }

            postMessage(data: any) {
                // Auto-reply to init to allow pool to start
                if (data.type === 'init') {
                    // We must access onmessage. WorkerPool sets it after constructor.
                    setTimeout(() => {
                        if (this.onmessage) {
                            this.onmessage({ data: { id: data.id, type: 'initialized' } } as any);
                        }
                    }, 10);
                }
                // STALL on 'predict' - do not reply
            }
        } as any;

        const pool = WorkerPoolManager.getInstance();
        // Set short timeout
        pool.configure({ timeout: 1000 } as PythonEngineOptions);

        // 1. Acquire worker (triggers init)
        const acquirePromise = pool.acquireWorker();

        // Allow init to process
        jest.advanceTimersByTime(50);
        const workerId = await acquirePromise;
        expect(workerId).toBeDefined();

        // 2. Execute Predict
        const predictPromise = pool.executePredict(workerId, 'model_1', { input: [1, 2, 3] });

        // 3. Fast-forward past timeout
        jest.advanceTimersByTime(1500); // > 1000ms

        // 4. Verify Timeout Check
        await expect(predictPromise).rejects.toMatchObject({
            type: PythonErrorType.TIMEOUT,
            message: expect.stringContaining('Worker timed out')
        });

        // 5. Verify Kill Logic
        expect(terminateMock).toHaveBeenCalled();
    });
});
