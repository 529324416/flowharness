/** 外壳与设计器之间的运行控制契约；M5 由 Workbench Framework 接管。 */
export type RunControls = {
    canRun: boolean;
    canPause: boolean;
    canResume: boolean;
    isRunning: boolean;
    isPaused: boolean;
    run: () => void;
    pause: () => void;
    resume: () => void;
    cancel: () => void;
};
