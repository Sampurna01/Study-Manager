import "./env";
import { createApp } from "./app";
import { DEMO } from "./demo";
import { MODEL, PROVIDER } from "./ai";

const port = Number(process.env.PORT) || 8787;

createApp().listen(port, () => {
  console.log(`Study Manager API listening on http://localhost:${port}`);
  if (DEMO) {
    console.log("Running in DEMO mode (no AI calls).");
  } else if (PROVIDER === "ollama") {
    console.log(`Using local AI through Ollama with model ${MODEL}.`);
    console.log(`If you haven't yet, install Ollama from https://ollama.com and run:  ollama pull ${MODEL}`);
  } else if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(`Using Claude (${MODEL}).`);
    console.warn("⚠️  No ANTHROPIC_API_KEY found. Add it to a .env file in this folder (see .env.example), then restart.");
  } else {
    console.log(`Using Claude (${MODEL}).`);
  }
});
