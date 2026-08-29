import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCFEnv } from "@/lib/cloudflare-env";
import { requireHermesAuth } from "@/lib/hermes-auth";

/**
 * Analysis steps posted by the Hermes agent as it works through a request.
 * Each POST appends one step; the browser polls GET to render drawings live.
 *
 * Drawing schema (JSON array stored in the `drawings` column):
 *   { type:"hline",  price:1.085, label:"Weekly res", color:"#ef4444", style:"solid"|"dashed"|"dotted" }
 *   { type:"trendline", p1time:1700000000, p1price:1.080, p2time:1700100000, p2price:1.090, label:"BOS", color:"#3b82f6" }
 *   { type:"zone", topPrice:1.088, bottomPrice:1.084, label:"Bullish OB", color:"#22c55e" }
 *   { type:"marker", time:1700050000, position:"aboveBar"|"belowBar", label:"Entry", color:"#f59e0b", markerType:"arrowUp"|"arrowDown"|"circle" }
 */
const stepInput = z.object({
  request_id: z.string(),
  pair: z.string(),
  step: z.number().int().min(0),
  step_label: z.string().optional(),
  drawings: z
    .array(
      z.object({
        type: z.enum(["hline", "trendline", "zone", "marker"]),
        price: z.number().optional(),
        label: z.string().optional(),
        color: z.string().optional(),
        style: z.enum(["solid", "dashed", "dotted"]).optional(),
        p1time: z.number().optional(),
        p1price: z.number().optional(),
        p2time: z.number().optional(),
        p2price: z.number().optional(),
        topPrice: z.number().optional(),
        bottomPrice: z.number().optional(),
        startTime: z.number().optional(),
        endTime: z.number().optional(),
        time: z.number().optional(),
        position: z.enum(["aboveBar", "belowBar"]).optional(),
        markerType: z.enum(["arrowUp", "arrowDown", "circle"]).optional(),
      }),
    )
    .default([]),
  summary: z.string().optional(),
});

export const Route = createFileRoute("/api/hermes/analysis")({
  server: {
    handlers: {
      /** Browser polls this to get analysis steps for a given request. */
      GET: async ({ request }) => {
        const env = getCFEnv();
        if (!env) return Response.json({ steps: [] });

        const url = new URL(request.url);
        const requestId = url.searchParams.get("request_id");
        if (!requestId) return Response.json({ steps: [] });

        const { results } = await env.DB.prepare(
          "SELECT * FROM hermes_analysis WHERE request_id = ? ORDER BY step ASC",
        )
          .bind(requestId)
          .all();

        return Response.json({ steps: results });
      },

      /** Hermes agent posts each analysis step (auth required). */
      POST: async ({ request }) => {
        const authErr = await requireHermesAuth(request);
        if (authErr) return authErr;

        const env = getCFEnv();
        if (!env) return new Response("Service unavailable", { status: 503 });

        const body = stepInput.parse(await request.json());
        const id = crypto.randomUUID();

        await env.DB.prepare(
          "INSERT INTO hermes_analysis (id, request_id, pair, step, step_label, drawings, summary) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
          .bind(
            id,
            body.request_id,
            body.pair,
            body.step,
            body.step_label ?? null,
            JSON.stringify(body.drawings),
            body.summary ?? null,
          )
          .run();

        return Response.json({ id }, { status: 201 });
      },
    },
  },
});
