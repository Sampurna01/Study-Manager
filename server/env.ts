import fs from "node:fs";

// Load settings such as ANTHROPIC_API_KEY from a .env file in the project folder,
// so they don't have to be typed into the terminal every time.
// Imported first by index.ts so the values exist before other modules read them.
if (fs.existsSync(".env")) process.loadEnvFile(".env");
