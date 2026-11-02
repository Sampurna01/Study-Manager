import { createApp } from "./app";
import { DEMO } from "./demo";
import { MODEL } from "./claude";

const port = Number(process.env.PORT) || 8787;

createApp().listen(port, () => {
  console.log(`Study Manager API listening on http://localhost:${port}`);
  console.log(DEMO ? "Running in DEMO mode (no Claude calls)." : `Using model ${MODEL}.`);
});
