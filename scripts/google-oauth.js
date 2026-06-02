import "dotenv/config";
import http from "node:http";
import { google } from "googleapis";

import { loadConfig } from "../src/config.js";
import { GOOGLE_WORKSPACE_SCOPES } from "../src/googleWorkspaceClient.js";
import fs from "node:fs";

function updateEnvValue(key, value) {
  const envPath = ".env";
  let content = fs.readFileSync(envPath, "utf8");
  if (new RegExp(`^${key}=`, "m").test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  } else {
    content = `${content.trimEnd()}\r\n${key}=${value}\r\n`;
  }
  fs.writeFileSync(envPath, content);
}

function waitForCode({ port, path }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (url.pathname !== path) {
          res.writeHead(404).end("Not found");
          return;
        }

        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400).end(`Google OAuth failed: ${error}`);
          reject(new Error(`Google OAuth failed: ${error}`));
          server.close();
          return;
        }

        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400).end("Missing OAuth code");
          reject(new Error("Missing OAuth code"));
          server.close();
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
          "<h1>CEO Partner Google OAuth complete</h1><p>You can close this tab and return to Codex.</p>"
        );
        resolve(code);
        server.close();
      } catch (error) {
        reject(error);
        server.close();
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`Waiting for Google OAuth callback on http://127.0.0.1:${port}${path}`);
    });
  });
}

const config = loadConfig();
const workspace = config.google.workspace;
if (!workspace.oauthClientId || !workspace.oauthClientSecret || !workspace.oauthRedirectUri) {
  throw new Error("Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI first.");
}

const redirectUrl = new URL(workspace.oauthRedirectUri);
const auth = new google.auth.OAuth2(
  workspace.oauthClientId,
  workspace.oauthClientSecret,
  workspace.oauthRedirectUri
);
const authUrl = auth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: GOOGLE_WORKSPACE_SCOPES
});

console.log("");
console.log("Open this URL and allow access:");
console.log(authUrl);
console.log("");

const code = await waitForCode({
  port: Number(redirectUrl.port || 80),
  path: redirectUrl.pathname
});
const { tokens } = await auth.getToken(code);
if (!tokens.refresh_token) {
  throw new Error("Google did not return a refresh token. Re-run and make sure prompt=consent is used.");
}

updateEnvValue("GOOGLE_OAUTH_REFRESH_TOKEN", tokens.refresh_token);
console.log("GOOGLE_OAUTH_REFRESH_TOKEN saved to .env");
