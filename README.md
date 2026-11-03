# Study Manager

Give it your course material and it gets you ready for the exam.

Upload your syllabus, lecture notes, slides exported to PDF, textbook chapters, assignments or past exams (or paste text). Study Manager identifies what each file is and uses AI to build:

- **Your syllabus, read for you.** It pulls out the weekly schedule (with the current week highlighted), every exam and assignment with its date and grade weight, learning outcomes and required materials. Weeks and exams are linked to study-guide topics, exam dates feed straight into the study plan, the Overview shows your next deadline, and topics the syllabus lists but your notes don't cover are flagged. You can add a syllabus to an existing course from the Syllabus tab.
- **An interactive study guide.** The material is split into ordered topics, each with a summary, key points, difficulty, prerequisites and a time estimate. Select any passage to get it explained, click underlined terms to see their definitions, tick off key points as you learn them, and take a quick three-question check inside each topic. You also get learning objectives and a searchable glossary.
- **Flashcards with spaced repetition.** Cards are generated per topic and scheduled with an SM‑2 style algorithm (Again / Hard / Good / Easy), so cards you find hard come back sooner.
- **Problem solving.** For maths, science and engineering courses, quizzes default to worked problems: a specific exercise, optional hints (each costs 10%), space for your working, and a final answer. Grading accepts equivalent answers (e.g. `1/2` and `0.5`), gives partial credit for a correct method, and points to the first wrong step. You then see the full worked solution. Maths is shown properly (fractions, matrices, integrals) everywhere in the app. Choose *Problem solving*, *Balanced* or *Concepts* for each quiz.
- **Adaptive quizzes.** Three modes: *Practice*, *Weak spots* (targets your lowest‑mastery topics and common misconceptions) and *Mock exam*. Multiple‑choice answers are checked straight away. Short answers are graded by the AI, with feedback and the points you missed.
- **A personal tutor.** A streaming chat grounded in your material. It explains, checks your understanding, gives hints before full solutions, and quizzes you one question at a time.
- **A study plan.** Enter your exam date and how long you can study each day. You get a day‑by‑day schedule that teaches topics in prerequisite order, schedules spaced reviews 1, 3 and 7 days after each topic, uses spare time for practice quizzes and keeps the last day for a mock exam. The plan is rebuilt from your current mastery every time you open it.
- **Mastery tracking.** Each topic's mastery comes from your quiz results (recent answers count more) and your flashcard retention. These add up to an overall *exam readiness* score, and the Overview tab tells you what to do next.

Your courses and progress are stored in your browser (IndexedDB). The server doesn't store anything.

**The AI runs for free on your own computer** through [Ollama](https://ollama.com), so your notes never leave your machine. You can switch to Claude through Anthropic's paid API with one setting.

## Getting started

You need **Node.js 20+** (from [nodejs.org](https://nodejs.org)) and **Ollama** (from [ollama.com](https://ollama.com)).

1. Install Ollama, open it once, and download the AI model (about 3 GB, one time only):
   ```bash
   ollama pull gemma3:4b
   ```
2. Install and start Study Manager:
   ```bash
   npm install
   npm run dev
   ```
3. Open **http://localhost:5173**.

**Shortcut:** after the first setup you can just double-click **`start-windows.bat`** (Windows) or **`start-mac.command`** (Mac) in the project folder. It installs anything missing, starts the app and opens your browser. Keep that window open while you study; close it to stop the app.

The local model is slower than a cloud AI. Building a study guide can take a few minutes, especially on the first run while the model loads.

### Choosing a model

| Model | Download | Best for |
|---|---|---|
| `gemma3:4b` (default) | ~3 GB | Any Apple-silicon Mac (8 GB memory or more) |
| `gemma3:12b` | ~8 GB | Better results on Macs with 16 GB or more |

To change it, run `ollama pull <model>` and put `OLLAMA_MODEL=<model>` in a `.env` file (copy `.env.example`).

Local models can only read a limited amount of text at once (about 75,000 characters by default). Longer material is rejected with a message rather than cut off. Split big courses into one course per unit, or raise `OLLAMA_MAX_CONTEXT` if your Mac has plenty of memory.

### Using Claude instead (optional, paid)

Put these in `.env`, then restart:
```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```
Claude gives noticeably better guides, questions and grading, and handles very long courses.

### Try it without any AI

```bash
npm run dev:demo
```

Demo mode uses a simple offline generator: topics come from headings and questions are fill‑in‑the‑blank. You can click through the whole app this way, but it isn't useful for actual studying.

### Production

```bash
npm run build        # builds the client into dist/
npm start            # serves the API and the built app on :8787
```

### Configuration

Set these in a `.env` file in the project folder (see `.env.example`) or in the terminal.

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `ollama` | `ollama` (free, local) or `anthropic` (Claude, paid) |
| `OLLAMA_MODEL` | `gemma3:4b` | Local model to use |
| `OLLAMA_MAX_CONTEXT` | `32768` | Tokens the local model may read at once |
| `OLLAMA_HOST` | `http://localhost:11434` | Where Ollama is running |
| `ANTHROPIC_API_KEY` | — | Claude credentials, when `AI_PROVIDER=anthropic` |
| `STUDY_MANAGER_MODEL` | `claude-opus-5-5` | Claude model, when `AI_PROVIDER=anthropic` |
| `STUDY_MANAGER_DEMO` | unset | Set to `1` for offline demo mode |
| `PORT` | `8787` | API server port |

### Troubleshooting

- **Nothing loads in the browser.** In development, open **http://localhost:5173**, not `:8787`. Keep the terminal running; closing it or pressing Ctrl+C stops the app. Wait for the line `Local: http://localhost:5173/` before opening the page.
- **`npm` or `node` is "not recognized".** Install Node.js 20+ from nodejs.org, then open a new terminal.
- **"Cannot find module" or "concurrently: not found".** Run `npm install` in the project folder first.
- **"Port 5173 / 8787 is already in use".** Another copy is still running. Close the other terminal, or run with a different API port: `PORT=8790 npm run dev`.
- **"Can't reach Ollama".** Open the Ollama app (look for the llama icon in the menu bar), then try again.
- **"The AI model … isn't downloaded yet".** Run the `ollama pull` command shown in the message.
- **Very slow.** Close other heavy apps, or try a smaller model. The first request after starting is always slower while the model loads.

## How it works

```
client/   React + Vite single-page app (views: overview, guide, flashcards, quiz, tutor, plan)
server/   Express API: file text extraction, AI calls (Ollama or Claude), demo mode
shared/   Schemas plus the pure learning logic (spaced repetition, mastery, study planner)
tests/    Vitest unit and API tests
```

- With **Ollama**, every request sends the course material plus a JSON schema, and Ollama constrains the model's output to that schema. The server checks each answer, retries once if it doesn't fit, and sizes the context window to the material, so text is never silently cut off.
- With **Claude**, the course material goes in a cached system block shared by every request about that course. Requests use structured outputs and server‑side refusal fallback (`fallbacks: "default"`).
- Either way, the server validates what comes back, for example dropping items that point at unknown topics and fixing malformed multiple‑choice questions.
- PDFs are converted to text on the server with `unpdf`, page by page. Scanned PDFs without a text layer can't be read. Material longer than the model can read is rejected with a message rather than silently truncated.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (with reload) and Vite dev server |
| `npm run dev:demo` | Same, in demo mode |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check everything |
| `npm run build` / `npm start` | Production build and server |
