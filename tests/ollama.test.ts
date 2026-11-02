import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod/v4";

// A fake Ollama server that streams NDJSON like the real /api/chat endpoint.
type Reply = { status?: number; chunks?: object[]; json?: object };
let replies: ((body: any) => Reply)[] = [];
const requests: any[] = [];
let server: http.Server;
let mod: typeof import("../server/ollama");

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const reply: Reply = (replies.shift() ?? (() => ({ chunks: [] })))(body);
      if (reply.json) {
        res.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.json));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      for (const c of reply.chunks ?? []) res.write(JSON.stringify(c) + "\n");
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.OLLAMA_HOST = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OLLAMA_MODEL = "test-model";
  mod = await import("../server/ollama");
});
afterAll(() => server.close());

const stream = (text: string, doneReason = "stop") => [
  ...text.match(/.{1,5}/gs)!.map((t) => ({ message: { role: "assistant", content: t }, done: false })),
  { done: true, done_reason: doneReason },
];
const Schema = z.object({ answer: z.string(), score: z.number() });
const req = { content: "Cells are small.", task: "Do it", schema: Schema, effort: "medium" as const };

describe("Ollama provider", () => {
  it("streams and parses structured output, sending the schema and a big enough context", async () => {
    replies.push(() => ({ chunks: stream('{"answer":"mitochondria","score":0.9}') }));
    await expect(mod.ollamaGenerate(req)).resolves.toEqual({ answer: "mitochondria", score: 0.9 });
    const body = requests.at(-1);
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
    expect(body.format.properties.answer.type).toBe("string");
    expect(body.options.num_ctx).toBeGreaterThanOrEqual(8192);
    expect(body.messages[0].content).toContain("Cells are small.");
  });

  it("retries once when the model's JSON doesn't fit the schema", async () => {
    replies.push(() => ({ chunks: stream('{"answer":"x"}') }));
    replies.push(() => ({ chunks: stream('{"answer":"x","score":1}') }));
    await expect(mod.ollamaGenerate(req)).resolves.toEqual({ answer: "x", score: 1 });
  });

  it("explains how to download a missing model", async () => {
    replies.push(() => ({ status: 404, json: { error: 'model "test-model" not found, try pulling it first' } }));
    await expect(mod.ollamaGenerate(req)).rejects.toThrow(/ollama pull test-model/);
  });

  it("reports answers cut off by the length limit", async () => {
    replies.push(() => ({ chunks: stream('{"answer":"x', "length") }));
    await expect(mod.ollamaGenerate(req)).rejects.toThrow(/cut off/);
  });

  it("refuses material that won't fit instead of truncating it", async () => {
    await expect(mod.ollamaGenerate({ ...req, content: "x".repeat(mod.MAX_CONTEXT * 4) })).rejects.toMatchObject({ status: 413 });
  });

  it("streams tutor replies", async () => {
    replies.push(() => ({ chunks: stream("Hello student") }));
    let out = "";
    await mod.ollamaTutor("notes", [{ role: "user", content: "hi" }], (t) => (out += t));
    expect(out).toBe("Hello student");
    expect(requests.at(-1).messages.at(-1)).toEqual({ role: "user", content: "hi" });
  });

  it("says when Ollama isn't running", async () => {
    const saved = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = "http://127.0.0.1:1";
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("../server/ollama");
    process.env.OLLAMA_HOST = saved;
    await expect(fresh.ollamaGenerate(req)).rejects.toThrow(/Ollama app is installed and running/);
  });
});
