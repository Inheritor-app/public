// SPDX-License-Identifier: CC0-1.0
// Runs a CLI script as a user would, answering its prompts in order, and local HTTP doubles for its services.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

/** Serves `handler(req, body) -> {status, body}` on 127.0.0.1. */
function serve(handler) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            const reply = await handler(req, body);
            res.writeHead(reply.status, { 'Content-Type': 'application/json' });
            res.end(reply.body);
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

/**
 * Runs `scripts/<name>` and answers each `{prompt, answer}` once the prompt appears after the previous one.
 * @returns {Promise<{code: number, output: string}>}
 */
function runScript(name, { cwd, env, answers, timeoutMs = 30_000 }) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', name)], {
            cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe']
        });
        let output = '';
        let cursor = 0;
        const pending = [...answers];
        const onData = (chunk) => {
            output += chunk;
            for (;;) {
                if (!pending.length) break;
                const at = output.indexOf(pending[0].prompt, cursor);
                if (at === -1) break;
                cursor = at + pending[0].prompt.length;
                child.stdin.write(pending.shift().answer + '\n');
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        const timer = setTimeout(() => child.kill(), timeoutMs);
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, output });
        });
    });
}

/** A temporary working folder with a key file for the fixture's beneficiary. */
function workspaceWithKeys(t, fixture) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inheritor-cli-e2e-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const keysDir = path.join(dir, 'keys');
    fs.mkdirSync(keysDir);
    fs.writeFileSync(path.join(keysDir, 'InheritorKeys_2026-10-24.json'), JSON.stringify({
        beneficiary: {
            ethereum: { address: fixture.keys.ethereum.address, privateKey: fixture.keys.ethereum.privateKey },
            quantumSafe: fixture.keys.quantum
        }
    }));
    return { dir, keysDir };
}

module.exports = { serve, runScript, workspaceWithKeys };
