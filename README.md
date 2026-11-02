# Study Manager

Give it your course material and it gets you ready for the exam.

Upload lecture notes, slides exported to PDF, textbook chapters or a syllabus (or paste text), and Study Manager uses Claude to build:

- **A study guide.** The material is split into ordered topics, each with a summary, key points, difficulty, prerequisites and a time estimate. You also get learning objectives and a searchable glossary.
- **Flashcards with spaced repetition.** Cards are generated per topic and scheduled with an SM‑2 style algorithm (Again / Hard / Good / Easy), so cards you find hard come back sooner.
- **Adaptive quizzes.** Three modes: *Practice*, *Weak spots* (targets your lowest‑mastery topics and common misconceptions) and *Mock exam*. Multiple‑choice answers are checked straight away. Short answers are graded by Claude, with feedback and the points you missed.
- **A personal tutor.** A streaming chat grounded in your material. It explains, checks your understanding, gives hints before full solutions, and quizzes you one question at a time.
- **A study plan.** Enter your exam date and how long you can study each day. You get a day‑by‑day schedule that teaches topics in prerequisite order, schedules spaced reviews 1, 3 and 7 days after each topic, uses spare time for practice quizzes and keeps the last day for a mock exam. The plan is rebuilt from your current mastery every time you open it.
- **Mastery tracking.** Each topic's mastery comes from your quiz results (recent answers count more) and your flashcard retention. These add up to an overall *exam readiness* score, and the Overview tab tells you what to do next.

Your courses and progress are stored in your browser (IndexedDB). The server doesn't store anything; it only passes requests to Claude.

## Getting started

Requirements: Node.js 20+ and an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev          # API on :8787, web app on http://localhost:5173
```

### Try it without an API key

```bash
npm run dev:demo
```

Demo mode swaps Claude for a simple offline generator: topics come from headings and questions are fill‑in‑the‑blank. You can click through the whole app this way, but it isn't useful for actual studying.

### Production

```bash
npm run build        # builds the client into dist/
npm start            # serves the API and the built app on :8787
```

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude credentials (`ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile also work) |
| `STUDY_MANAGER_MODEL` | `claude-opus-5-5` | Model used for all generation |
| `STUDY_MANAGER_DEMO` | unset | Set to `1` for offline demo mode |
| `PORT` | `8787` | API server port |

### Troubleshooting

- **Nothing loads in the browser.** In development, open **http://localhost:5173**, not `:8787`. Keep the terminal running; closing it or pressing Ctrl+C stops the app. Wait for the line `Local: http://localhost:5173/` before opening the page.
- **`npm` or `node` is "not recognized".** Install Node.js 20+ from nodejs.org, then open a new terminal.
- **"Cannot find module" or "concurrently: not found".** Run `npm install` in the project folder first.
- **"Port 5173 / 8787 is already in use".** Another copy is still running. Close the other terminal, or run with a different API port: `PORT=8790 npm run dev`.
- **The app opens but buttons show an Anthropic credentials error.** Set `ANTHROPIC_API_KEY` in the same terminal before `npm run dev`, or use `npm run dev:demo`.

## How it works

```
client/   React + Vite single-page app (views: overview, guide, flashcards, quiz, tutor, plan)
server/   Express API: file text extraction, Claude calls, demo mode
shared/   Schemas plus the pure learning logic (spaced repetition, mastery, study planner)
tests/    Vitest unit and API tests
```

- Every Claude request about a course puts the course material in a **cached system block**. Generating the guide, flashcards, quizzes, grading and tutoring all reuse the same prompt‑cache prefix, which keeps repeat calls fast and cheap.
- Guides, flashcards, quizzes and grades use **structured outputs** (Zod schemas), so responses always parse. The server also validates them, for example dropping items that point at unknown topics and fixing malformed multiple‑choice questions.
- Requests turn on Claude's **server‑side refusal fallback** (`fallbacks: "default"`).
- PDFs are converted to text on the server with `unpdf`, page by page. Scanned PDFs without a text layer can't be read. Course material over about 3.2M characters is rejected with a message rather than silently truncated. Split very large courses into one course per unit.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (with reload) and Vite dev server |
| `npm run dev:demo` | Same, in demo mode |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check everything |
| `npm run build` / `npm start` | Production build and server |
