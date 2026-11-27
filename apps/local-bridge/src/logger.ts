// ANSI color codes
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

function timestamp(): string {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  return `${DIM}[${hh}:${mm}:${ss}]${RESET}`;
}

function formatLevel(level: string, color: string): string {
  return `${color}[${level.toUpperCase().padEnd(5)}]${RESET}`;
}

const USE_STDERR = process.env.DRISHTI_NATIVE_HOST === '1' || process.argv.includes('--native-host');

function info(message: string, ...args: unknown[]): void {
  const line = `${timestamp()} ${formatLevel('info', GREEN)} ${CYAN}${message}${RESET}`;
  if (USE_STDERR) console.error(line, ...args);
  else console.log(line, ...args);
}

function warn(message: string, ...args: unknown[]): void {
  console.warn(`${timestamp()} ${formatLevel('warn', YELLOW)} ${YELLOW}${message}${RESET}`, ...args);
}

function error(message: string, ...args: unknown[]): void {
  console.error(`${timestamp()} ${formatLevel('error', RED)} ${RED}${message}${RESET}`, ...args);
}

function debug(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
    const line = `${timestamp()} ${formatLevel('debug', MAGENTA)} ${DIM}${message}${RESET}`;
    if (USE_STDERR) console.error(line, ...args);
    else console.debug(line, ...args);
  }
}

export const logger = { info, warn, error, debug };
