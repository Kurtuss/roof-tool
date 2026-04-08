/**
 * Run this ONCE to get your Google Drive refresh token.
 *
 *   node scripts/google-auth.js
 *
 * Then paste the refresh token into your .env.local file.
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local
 */

const { google } = require("googleapis");
const readline   = require("readline");
const fs         = require("fs");
const path       = require("path");

// ── Minimal .env.local parser (no dotenv needed) ─────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    console.error("\n❌ .env.local not found. Copy .env.example to .env.local and fill in your Google credentials.\n");
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const clientId     = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || clientId === "your_google_client_id_here") {
  console.error("\n❌ GOOGLE_CLIENT_ID is not set in .env.local\n");
  console.error("Steps:");
  console.error("  1. Go to https://console.cloud.google.com");
  console.error("  2. Create a project → APIs & Services → Credentials");
  console.error("  3. Create OAuth 2.0 Client ID (Desktop App)");
  console.error("  4. Paste the Client ID and Secret into .env.local\n");
  process.exit(1);
}

if (!clientSecret || clientSecret === "your_google_client_secret_here") {
  console.error("\n❌ GOOGLE_CLIENT_SECRET is not set in .env.local\n");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  "urn:ietf:wg:oauth:2.0:oob"
);

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const url    = oauth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES });

console.log("\n✅ Google credentials loaded from .env.local\n");
console.log("1. Open this URL in your browser:\n");
console.log("   " + url);
console.log("\n2. Sign in, authorise the app, then paste the code below.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Paste the authorisation code: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\n✅ Success! Add this to your .env.local file:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\nThen restart the app and you're connected to Google Drive.\n");
  } catch (err) {
    console.error("\n❌ Failed to get token:", err.message);
    console.error("Make sure you copied the full authorisation code.\n");
  }
});
