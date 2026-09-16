const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const line = '─'.repeat(56);

console.log(`
${DIM}${line}${RESET}

  The stagewise CLI has been replaced by the stagewise
  desktop app — a much more powerful way to use stagewise.

  ${BOLD}Download:${RESET}  ${CYAN}https://ade.stagewise.io/download${RESET}
  ${BOLD}Docs:${RESET}      ${CYAN}https://docs.stagewise.io${RESET}

${DIM}${line}${RESET}
`);

process.exit(0);
