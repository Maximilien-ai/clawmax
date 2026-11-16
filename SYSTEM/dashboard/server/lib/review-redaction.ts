export function sanitizeReviewLogLine(line: string): string {
  return line
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
    .replace(/\b(api[_-]?key|token|password|secret)\b(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2[REDACTED]')
    .replace(/\b(sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}\b/g, '[REDACTED]')
    .slice(0, 1000)
}

