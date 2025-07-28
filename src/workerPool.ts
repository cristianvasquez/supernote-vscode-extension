import { Worker } from "worker_threads";
import * as path from "path";
import * as vscode from "vscode";

interface WorkerTask {
    id: string;
    noteBuffer: Buffer;
    pageIndex: number;
    resolve: (value: any) => void;
    reject: (error: any) => void;
}

interface WorkerMessage {
    status: "success" | "error";
    pageIndex: number;
    buffer?: Buffer;
    width?: number;
    height?: number;
    error?: string;
}

export class WorkerPool {
    private workers: Worker[] = [];
    private taskQueue: WorkerTask[] = [];
    private busyWorkers: Set<Worker> = new Set();
    private maxWorkers: number;
    private workerPath: string;

    constructor(maxWorkers: number, context: vscode.ExtensionContext) {
        this.maxWorkers = maxWorkers;
        this.workerPath = vscode.Uri.joinPath(
            context.extensionUri,
            "out",
            "page-worker.js"
        ).fsPath;
    }

    async processPage(noteBuffer: Buffer, pageIndex: number): Promise<WorkerMessage> {
        return new Promise((resolve, reject) => {
            const task: WorkerTask = {
                id: `page-${pageIndex}`,
                noteBuffer,
                pageIndex,
                resolve,
                reject
            };

            this.taskQueue.push(task);
            this.processNextTask();
        });
    }

    private processNextTask(): void {
        if (this.taskQueue.length === 0) return;

        // Find an available worker
        let availableWorker = this.workers.find(worker => !this.busyWorkers.has(worker));
        
        if (!availableWorker && this.workers.length < this.maxWorkers) {
            // Create a new worker
            availableWorker = this.createWorker();
        }

        if (!availableWorker) return; // All workers are busy

        const task = this.taskQueue.shift()!;
        this.busyWorkers.add(availableWorker);

        availableWorker.postMessage({
            noteBuffer: task.noteBuffer,
            pageIndex: task.pageIndex
        });

        // Set up one-time message handler for this task
        const messageHandler = (msg: WorkerMessage) => {
            availableWorker!.off('message', messageHandler);
            this.busyWorkers.delete(availableWorker!);
            
            if (msg.status === "success") {
                task.resolve(msg);
            } else {
                task.reject(new Error(msg.error));
            }
            
            // Process next task
            this.processNextTask();
        };

        availableWorker.on('message', messageHandler);

        // Set up error handler
        const errorHandler = (error: Error) => {
            availableWorker!.off('error', errorHandler);
            this.busyWorkers.delete(availableWorker!);
            task.reject(error);
            this.processNextTask();
        };

        availableWorker.on('error', errorHandler);
    }

    private createWorker(): Worker {
        const worker = new Worker(this.workerPath);
        this.workers.push(worker);
        
        // Handle worker exit
        worker.on('exit', (code) => {
            const index = this.workers.indexOf(worker);
            if (index > -1) {
                this.workers.splice(index, 1);
            }
            this.busyWorkers.delete(worker);
            
            // If worker crashed and we have pending tasks, create a new one
            if (code !== 0 && this.taskQueue.length > 0) {
                this.processNextTask();
            }
        });

        return worker;
    }

    async shutdown(): Promise<void> {
        // Wait for all tasks to complete
        while (this.taskQueue.length > 0 || this.busyWorkers.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Terminate all workers
        const terminationPromises = this.workers.map(worker => {
            return new Promise<void>((resolve) => {
                worker.on('exit', () => resolve());
                worker.terminate();
            });
        });

        await Promise.all(terminationPromises);
        this.workers = [];
        this.busyWorkers.clear();
    }

    getStats() {
        return {
            totalWorkers: this.workers.length,
            busyWorkers: this.busyWorkers.size,
            queuedTasks: this.taskQueue.length
        };
    }
} 