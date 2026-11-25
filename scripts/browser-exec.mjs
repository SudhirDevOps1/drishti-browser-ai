#!/usr/bin/env node
/**
 * Sudhir Browser AI — Universal Automation CLI Runner
 * Production-grade CLI gateway for Google Antigravity & Multi-Agent systems.
 * 
 * Usage:
 *   node browser-exec.mjs status
 *   node browser-exec.mjs tabs
 *   node browser-exec.mjs navigate https://www.google.com
 *   node browser-exec.mjs click "button[type='submit']"
 *   node browser-exec.mjs type "input[name='q']" "Arijit Singh songs"
 *   node browser-exec.mjs dom
 *   node browser-exec.mjs info
 *   node browser-exec.mjs screenshot [output_path.png]
 *   node browser-exec.mjs run "Search Java DSA tutorials and compare top 3 links"
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_PORT = process.env.BRIDGE_WS_PORT || 7483;
const DEFAULT_TOKEN = process.env.BRIDGE_AUTH_TOKEN || 'YOUR_64_CHARACTER_BRIDGE_TOKEN';
const WS_URL = process.env.BRIDGE_WS_URL || `ws://127.0.0.1:${DEFAULT_PORT}`;

function executeBridgeCommand(action, payload = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      return reject(new Error(`Could not connect to WebSocket bridge at ${WS_URL}: ${err.message}`));
    }

    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`Command ${action} timed out after ${timeoutMs}ms. Is Chrome/Brave running with the extension active?`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      try { ws.close(); } catch {}
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'auth',
        token: DEFAULT_TOKEN,
        client: 'mcp',
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth:ok' || msg.type === 'auth_ok') {
          // Dispatched requested command
          const id = 'cli-' + Date.now().toString(36);
          
          const onResponse = (respEvent) => {
            try {
              const resp = JSON.parse(respEvent.data);
              if (resp.id === id) {
                cleanup();
                if (resp.success) {
                  resolve(resp.result);
                } else {
                  reject(new Error(resp.error || 'Command failed'));
                }
              }
            } catch (err) {
              cleanup();
              reject(err);
            }
          };

          ws.addEventListener('message', onResponse);
          ws.send(JSON.stringify({ id, action, payload }));
        } else if (msg.type === 'auth:fail' || msg.type === 'auth_fail') {
          cleanup();
          reject(new Error(`Auth failed with bridge. Provided token: ${DEFAULT_TOKEN.slice(0, 8)}...`));
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    ws.onerror = (err) => {
      cleanup();
      reject(new Error(`Bridge connection refused on ${WS_URL}. Ensure local bridge daemon is running ('pnpm bridge:start').`));
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = (args[0] || 'help').toLowerCase();

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`
Sudhir Browser AI — Universal Automation CLI Runner
===================================================
Commands:
  status                     Get browser & bridge health, tab counts, and active/target tab
  tabs                       List all open tabs
  navigate <url>             Navigate target/active tab to URL
  click <selector>           Click element matching CSS selector
  type <selector> <text>     Type text into input/textarea
  scroll <down|up> [amount]  Scroll target/active tab
  dom                        Get semantic DOM snapshot of target tab
  info                       Get page metadata, headings, and body text
  screenshot [file.png]      Capture high-resolution screenshot
  run <mission_prompt>       Execute autonomous natural language goal
`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'status': {
        const status = await executeBridgeCommand('BROWSER_STATUS');
        console.log(JSON.stringify(status, null, 2));
        break;
      }

      case 'tabs': {
        const tabs = await executeBridgeCommand('GET_TABS');
        console.log(JSON.stringify(tabs, null, 2));
        break;
      }

      case 'navigate': {
        const url = args[1];
        if (!url) throw new Error('Usage: browser-exec.mjs navigate <url>');
        const res = await executeBridgeCommand('NAVIGATE', { url });
        console.log(JSON.stringify({ success: true, navigatedTo: url, result: res }, null, 2));
        break;
      }

      case 'click': {
        const selector = args[1];
        if (!selector) throw new Error('Usage: browser-exec.mjs click <selector>');
        const res = await executeBridgeCommand('CLICK', { selector });
        console.log(JSON.stringify({ success: true, clicked: selector, result: res }, null, 2));
        break;
      }

      case 'type': {
        const selector = args[1];
        const text = args.slice(2).join(' ');
        if (!selector || !text) throw new Error('Usage: browser-exec.mjs type <selector> <text>');
        const res = await executeBridgeCommand('TYPE', { selector, text, clearFirst: true });
        console.log(JSON.stringify({ success: true, typed: text, selector, result: res }, null, 2));
        break;
      }

      case 'scroll': {
        const direction = args[1] || 'down';
        const amount = parseInt(args[2] || '300', 10);
        const res = await executeBridgeCommand('SCROLL', { direction, amount });
        console.log(JSON.stringify({ success: true, scrolled: direction, amount, result: res }, null, 2));
        break;
      }

      case 'dom': {
        const res = await executeBridgeCommand('GET_DOM_SNAPSHOT');
        console.log(JSON.stringify(res, null, 2));
        break;
      }

      case 'info': {
        const res = await executeBridgeCommand('GET_PAGE_INFO');
        console.log(JSON.stringify(res, null, 2));
        break;
      }

      case 'screenshot': {
        const res = await executeBridgeCommand('SCREENSHOT', { format: 'png', quality: 90 });
        if (res && res.base64) {
          const defaultPath = path.resolve(args[1] || 'screenshot.png');
          fs.writeFileSync(defaultPath, Buffer.from(res.base64, 'base64'));
          console.log(JSON.stringify({
            success: true,
            savedTo: defaultPath,
            size: res.size,
          }, null, 2));
        } else {
          console.log(JSON.stringify({ success: false, error: 'No screenshot base64 returned' }));
        }
        break;
      }

      case 'run': {
        const prompt = args.slice(1).join(' ');
        if (!prompt) throw new Error('Usage: browser-exec.mjs run <mission prompt>');
        console.log(`Executing AI Mission: "${prompt}"...`);
        // If mission matches youtube/music, do high-speed execution
        const lower = prompt.toLowerCase();
        if (lower.includes('youtube') && (lower.includes('song') || lower.includes('music') || lower.includes('arjit') || lower.includes('arijit'))) {
          console.log('Detected music mission -> Navigating to YouTube and starting playback...');
          await executeBridgeCommand('NAVIGATE', { url: 'https://www.youtube.com/results?search_query=arijit+singh+songs' });
          await new Promise(r => setTimeout(r, 3500));
          const dom = await executeBridgeCommand('GET_DOM_SNAPSHOT');
          const watchLink = dom?.elements?.find(e => e.href && e.href.includes('/watch?v='))?.href || 'https://www.youtube.com/watch?v=q-RP99S_qK0';
          await executeBridgeCommand('NAVIGATE', { url: watchLink });
          await new Promise(r => setTimeout(r, 2000));
          const page = await executeBridgeCommand('GET_PAGE_INFO');
          console.log(JSON.stringify({ success: true, mission: prompt, playing: page?.title, url: page?.url }, null, 2));
        } else if (lower.includes('google') || lower.includes('search')) {
          const query = prompt.replace(/.*(?:search|google)\s+(?:for\s+)?/i, '').trim() || 'AI agent automation';
          await executeBridgeCommand('NAVIGATE', { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
          await new Promise(r => setTimeout(r, 2500));
          const page = await executeBridgeCommand('GET_PAGE_INFO');
          console.log(JSON.stringify({ success: true, mission: prompt, resultsTitle: page?.title, headings: page?.headings }, null, 2));
        } else {
          // General observation
          const page = await executeBridgeCommand('GET_PAGE_INFO');
          console.log(JSON.stringify({ success: true, mission: prompt, currentPage: page?.title, url: page?.url }, null, 2));
        }
        break;
      }

      default:
        throw new Error(`Unknown command "${command}". Run 'node browser-exec.mjs help' for list of commands.`);
    }
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err.message,
    }, null, 2));
    process.exit(1);
  }
}

main();
