const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");

const cwd = join(__dirname, "..");

const command = "C:\\Progra~1\\nodejs\\node.exe src/index.js >> server.out.log 2>> server.err.log";
const child = spawn("cmd.exe", ["/d", "/c", command], {
  cwd,
  detached: true,
  stdio: "ignore",
  windowsHide: true
});

writeFileSync(join(cwd, "server.pid"), String(child.pid));
child.unref();
console.log(child.pid);
