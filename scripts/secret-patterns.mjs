// Shared by the scanner and its tests. Patterns are intentionally conservative to avoid false negatives on a public repo.
export const RULES = [
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'openai-style-key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { name: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: 'github-token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{40,}/,
  },
  { name: 'stripe-secret-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'supabase-secret-key', re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: 'jwt-like-token',
    re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: 'secret-assignment',
    // NAME=value or NAME: "value" where NAME looks sensitive and the value is long, non-placeholder text.
    re: /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN)[A-Z0-9_]*\s*[=:]\s*["']?(?!your-|<|\$|changeme|example|placeholder|xxx|\s|["']|$)[A-Za-z0-9/+_.-]{20,}/,
  },
];

export function scanText(text, _file = '') {
  const hits = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/secret-scan:\s*allow/.test(line)) return;
    for (const r of RULES) if (r.re.test(line)) hits.push({ line: i + 1, rule: r.name });
  });
  return hits;
}
