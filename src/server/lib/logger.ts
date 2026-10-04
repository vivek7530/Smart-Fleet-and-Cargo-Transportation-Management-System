/* Tiny leveled logger — keeps output readable without pulling in a dependency. */

const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

function stamp(): string {
  return `${colors.gray}${new Date().toISOString()}${colors.reset}`;
}

export const logger = {
  info(message: string, ...rest: unknown[]) {
    console.log(`${stamp()} ${colors.cyan}info${colors.reset}  ${message}`, ...rest);
  },
  success(message: string, ...rest: unknown[]) {
    console.log(`${stamp()} ${colors.green}ok${colors.reset}    ${message}`, ...rest);
  },
  warn(message: string, ...rest: unknown[]) {
    console.warn(`${stamp()} ${colors.yellow}warn${colors.reset}  ${message}`, ...rest);
  },
  error(message: string, ...rest: unknown[]) {
    console.error(`${stamp()} ${colors.red}error${colors.reset} ${message}`, ...rest);
  },
};
