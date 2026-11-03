import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import {
  ClassifyRequestSchema,
  SyllabusRequestSchema,
  FlashcardRequestSchema,
  GradeRequestSchema,
  GuideRequestSchema,
  QuizRequestSchema,
  TutorRequestSchema,
} from "../shared/schemas";
import { AIError, MODEL, PROVIDER, maxContentChars, streamTutor, toAIError } from "./ai";
import { buildFlashcards, buildGuide, buildQuiz, classifySource, drawDiagram, extractSyllabus, gradeAnswer } from "./study";
import { DiagramRequestSchema } from "../shared/diagram";
import { DEMO, demoDiagram, demoClassify, demoFlashcards, demoGrade, demoGuide, demoQuiz, demoSyllabus, demoTutor } from "./demo";
import { UnsupportedFileError, extractFileText } from "./extract";

// Material longer than the model can read in one go is rejected with a clear
// message rather than silently truncated.
export const MAX_CONTENT_CHARS = maxContentChars();

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, `Invalid request: ${issue.path.join(".") || "body"} — ${issue.message}`);
  }
  const data = result.data as { content?: string; text?: string };
  const material = data.content ?? data.text;
  if (typeof material === "string" && material.length > MAX_CONTENT_CHARS) {
    throw new HttpError(
      413,
      `The course material is too long for the ${PROVIDER === "ollama" ? "local AI model" : "AI model"} (${material.length.toLocaleString()} characters; the limit is ${MAX_CONTENT_CHARS.toLocaleString()}). Split it into separate courses, e.g. one per unit or chapter.`,
    );
  }
  return result.data;
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 20 } });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, demo: DEMO, provider: DEMO ? "demo" : PROVIDER, model: DEMO ? "demo" : MODEL });
  });

  app.post(
    "/api/extract",
    upload.array("files"),
    asyncRoute(async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw new HttpError(400, "No files were uploaded.");
      const results = [];
      for (const f of files) {
        try {
          const text = (await extractFileText(f.originalname, f.buffer)).trim();
          results.push({ name: f.originalname, text, error: text ? undefined : "No text found (is it a scanned PDF?)" });
        } catch (err) {
          const message = err instanceof UnsupportedFileError ? err.message : `Couldn't read "${f.originalname}".`;
          results.push({ name: f.originalname, text: "", error: message });
        }
      }
      res.json({ files: results });
    }),
  );

  app.post(
    "/api/classify",
    asyncRoute(async (req, res) => {
      const { name, text } = parseBody(ClassifyRequestSchema, req.body);
      res.json({ classification: DEMO ? demoClassify(name, text) : await classifySource(name, text) });
    }),
  );

  app.post(
    "/api/syllabus",
    asyncRoute(async (req, res) => {
      const body = parseBody(SyllabusRequestSchema, req.body);
      res.json({ syllabus: DEMO ? demoSyllabus(body) : await extractSyllabus(body) });
    }),
  );

  app.post(
    "/api/diagram",
    asyncRoute(async (req, res) => {
      const { content, about } = parseBody(DiagramRequestSchema, req.body);
      res.json({ diagram: DEMO ? demoDiagram(about) : await drawDiagram(content, about) });
    }),
  );

  app.post(
    "/api/guide",
    asyncRoute(async (req, res) => {
      const { title, content } = parseBody(GuideRequestSchema, req.body);
      res.json({ guide: DEMO ? demoGuide(title, content) : await buildGuide(title, content) });
    }),
  );

  app.post(
    "/api/flashcards",
    asyncRoute(async (req, res) => {
      const body = parseBody(FlashcardRequestSchema, req.body);
      res.json({ cards: DEMO ? demoFlashcards(body) : await buildFlashcards(body) });
    }),
  );

  app.post(
    "/api/quiz",
    asyncRoute(async (req, res) => {
      const body = parseBody(QuizRequestSchema, req.body);
      res.json({ questions: DEMO ? demoQuiz(body) : await buildQuiz(body) });
    }),
  );

  app.post(
    "/api/grade",
    asyncRoute(async (req, res) => {
      const body = parseBody(GradeRequestSchema, req.body);
      res.json({ grade: DEMO ? demoGrade(body) : await gradeAnswer(body) });
    }),
  );

  app.post(
    "/api/tutor",
    asyncRoute(async (req, res) => {
      const { content, messages } = parseBody(TutorRequestSchema, req.body);
      if (messages[messages.length - 1].role !== "user") throw new HttpError(400, "The last message must be from the student.");
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableFinished) controller.abort();
      });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");
      const write = (t: string) => res.write(t);
      try {
        if (DEMO) await demoTutor(content, messages, write);
        else await streamTutor(content, messages, write, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        const e = toAIError(err);
        if (!res.headersSent) throw e;
        res.write(`\n\n⚠️ ${e.message}`);
      }
      res.end();
    }),
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Production: serve the built client.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, "../dist");
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    // Dev mode: the web app is served by Vite, not this server. Point people there.
    app.get("/", (_req, res) => {
      res.type("html").send(
        `<!doctype html><meta charset="utf-8"><title>Study Manager</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.5">
<h1>This is the Study Manager API server</h1>
<p>The app itself runs at <a href="http://localhost:5173">http://localhost:5173</a> while you use <code>npm run dev</code>.</p>
<p>To serve everything from this port instead, run <code>npm run build</code> and then <code>npm start</code>.</p></body>`,
      );
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let status = 500;
    let message = "Something went wrong.";
    if (err instanceof HttpError || err instanceof AIError) {
      status = err.status;
      message = err.message;
    } else if (err instanceof multer.MulterError) {
      status = 400;
      message = err.code === "LIMIT_FILE_SIZE" ? "A file is larger than the 30 MB limit." : err.message;
    } else if (err && typeof err === "object" && "type" in err && err.type === "entity.too.large") {
      status = 413;
      message = "The request is too large.";
    } else {
      console.error(err);
    }
    if (res.headersSent) return res.end();
    res.status(status).json({ error: message });
  });

  return app;
}
