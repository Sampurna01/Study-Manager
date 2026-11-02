import "./env";
import { createApp } from "./app";
import { DEMO } from "./demo";
import { MODEL } from "./claude";

const port = Number(process.env.PORT) || 8787;

createApp().listen(port, () => {
  console.log(`Study Manager API listening on http://localhost:${port}`);
  if (DEMO) {
    console.log("Running in DEMO mode (no Claude calls).");
  } else if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(`Using model ${MODEL}.`);
    console.warn("⚠️  No ANTHROPIC_API_KEY found. Add it to a .env file in this folder (see .env.example), then restart.");
  } else {
    console.log(`Using model ${MODEL}.`);
  }
});
