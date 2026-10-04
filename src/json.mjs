export const MAX_INPUT_BYTES=1_000_000;
export class ValidationError extends Error {constructor(message){super(message);this.name='ValidationError';}}
const fail=message=>{throw new ValidationError(message);};
/** Strict JSON parser: duplicate object keys (including escaped spellings) are errors. */
export function parseStrictJSON(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_INPUT_BYTES) fail('JSON: file exceeds 1,000,000 bytes');
  let i = 0;
  const ws = () => { while (/[\t\n\r ]/.test(text[i] ?? '\uffff')) i++; };
  const str = () => {
    const start = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') { try { return JSON.parse(text.slice(start,i)); } catch { fail(`JSON: invalid string near character ${start + 1}`); } }
    }
    fail('JSON: unterminated string');
  };
  const value = depth => {
    if (depth > 20) fail('JSON: nesting exceeds 20 levels');
    ws(); const c = text[i];
    if (c === '"') return str();
    if (c === '{') {
      i++; ws(); const out = Object.create(null); const seen = new Set();
      if (text[i] === '}') { i++; return out; }
      while (true) {
        ws(); if (text[i] !== '"') fail(`JSON: expected a key near character ${i+1}`);
        const k = str(); if (seen.has(k)) fail(`JSON: duplicate key ${k}`); seen.add(k);
        ws(); if (text[i++] !== ':') fail('JSON: expected colon'); out[k] = value(depth+1); ws();
        if (text[i] === '}') { i++; return out; } if (text[i++] !== ',') fail('JSON: expected comma');
      }
    }
    if (c === '[') {
      i++; ws(); const out = []; if (text[i] === ']') { i++; return out; }
      while (true) { out.push(value(depth+1)); ws(); if (text[i] === ']') { i++; return out; } if (text[i++] !== ',') fail('JSON: expected comma'); }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!token) fail(`JSON: invalid value near character ${i+1}`);
    i += token[0].length; const parsed = JSON.parse(token[0]); if (typeof parsed === 'number' && !Number.isFinite(parsed)) fail('JSON: non-finite number'); return parsed;
  };
  const result = value(0); ws(); if (i !== text.length) fail(`JSON: trailing content near character ${i+1}`); return result;
}
