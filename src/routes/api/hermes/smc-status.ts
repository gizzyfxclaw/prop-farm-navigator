import { createFileRoute } from "@tanstack/react-router";
import * as fs from "node:fs";

/**
 * Returns live status of the SMC processor — last log lines + isProcessing flag.
 * The UI polls this to show "Hermes is analyzing EURUSD..." in real time.
 */
export const Route = createFileRoute("/api/hermes/smc-status")({
  server: {
    handlers: {
      GET: async () => {
        const LOG = "/home/ubuntu/.hermes/smc-processor.log";
        let lines: string[] = [];
        let isProcessing = false;
        let lastRun = "";
        let currentPair = "";

        try {
          const content = fs.readFileSync(LOG, "utf-8");
          const all = content.split("\n").filter(Boolean);

          // Find last Start and Done positions
          let lastStartIdx = -1;
          let lastDoneIdx  = -1;
          for (let i = all.length - 1; i >= 0; i--) {
            const l = all[i] ?? "";
            if (lastStartIdx < 0 && l.includes("Starting...")) lastStartIdx = i;
            if (lastDoneIdx  < 0 && l.includes("Done (exit")) lastDoneIdx  = i;
            if (lastStartIdx >= 0 && lastDoneIdx >= 0) break;
          }

          isProcessing = lastStartIdx > lastDoneIdx;

          // Last timestamp line
          for (let i = all.length - 1; i >= 0; i--) {
            const l = all[i] ?? "";
            if (/^\d{4}-\d{2}-\d{2}T/.test(l)) {
              lastRun = l.split(" ")[0] ?? l;
              break;
            }
          }

          // Current pair being processed
          for (let i = all.length - 1; i >= 0; i--) {
            const l = all[i] ?? "";
            const m = l.match(/Processing [0-9a-f]+: (\w+) (\w+)/);
            if (m) {
              currentPair = `${m[1]} ${m[2]}`;
              break;
            }
          }

          lines = all.slice(-15);
        } catch {
          lines = ["Log not available"];
        }

        return Response.json({ isProcessing, lastRun, currentPair, lines });
      },
    },
  },
});
