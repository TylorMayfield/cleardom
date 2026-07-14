import type { ScanProgress } from "./types.js";

export type ProgressOutput = {
  isTTY?: boolean;
  write: (value: string) => unknown;
};

export function createScanProgressReporter(output: ProgressOutput = process.stderr): {
  report: (progress: ScanProgress) => void;
  finish: () => void;
} {
  const interactive = Boolean(output.isTTY);
  let activeLine = false;
  const writeLine = (message: string): void => {
    if (activeLine) output.write("\r\u001b[2K");
    output.write(`${message}\n`);
    activeLine = false;
  };

  return {
    report(progress): void {
      if (progress.phase === "source") {
        writeLine(`Running source checks (${progress.files} ${progress.files === 1 ? "file" : "files"})...`);
      } else if (progress.phase === "runtime-discovery") {
        writeLine("Discovering rendered routes...");
      } else if (progress.phase === "runtime-browser") {
        writeLine("Starting browser...");
      } else if (progress.phase === "runtime-start") {
        const runs = progress.pages * progress.viewports;
        writeLine(`Running rendered checks (${progress.pages} ${progress.pages === 1 ? "route" : "routes"}, ${progress.viewports} ${progress.viewports === 1 ? "viewport" : "viewports"}, ${runs} page ${runs === 1 ? "run" : "runs"})...`);
      } else if (interactive) {
        const viewport = progress.viewport.name ?? `${progress.viewport.width}x${progress.viewport.height}`;
        output.write(`\r\u001b[2K  [${progress.completed}/${progress.total}] ${progress.route} · ${viewport}`);
        activeLine = true;
        if (progress.completed === progress.total) writeLine("");
      } else if (progress.completed === progress.total) {
        writeLine(`Rendered checks complete (${progress.total} page ${progress.total === 1 ? "run" : "runs"}).`);
      }
    },
    finish(): void {
      if (activeLine) writeLine("");
    }
  };
}
