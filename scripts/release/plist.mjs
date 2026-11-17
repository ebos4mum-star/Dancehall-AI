// Minimal reader for the XML property lists Expo generates (strings, booleans, integers, arrays, dictionaries). No dependencies.
export function parsePlist(xml) {
  const tokens = [
    ...xml
      .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '')
      .matchAll(/<(\/?)([a-zA-Z]+)(?:\s[^>/]*)?(\s*\/)?>|([^<]+)/g),
  ];
  let i = 0;
  const unesc = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const text = () => (tokens[i] && tokens[i][4] !== undefined ? tokens[i++][4] : '');
  function value() {
    while (tokens[i] && tokens[i][4] !== undefined && !tokens[i][4].trim()) i++;
    const [, close, name, selfClose] = tokens[i++];
    if (close) throw new Error(`unexpected </${name}>`);
    if (name === 'true') return true;
    if (name === 'false') return false;
    if (name === 'dict') {
      const o = {};
      if (selfClose) return o;
      for (;;) {
        while (tokens[i][4] !== undefined && !tokens[i][4].trim()) i++;
        if (tokens[i][1] === '/' && tokens[i][2] === 'dict') {
          i++;
          return o;
        }
        i++; // <key>
        const k = unesc(text());
        i++; // </key>
        o[k] = value();
      }
    }
    if (name === 'array') {
      const a = [];
      if (selfClose) return a;
      for (;;) {
        while (tokens[i][4] !== undefined && !tokens[i][4].trim()) i++;
        if (tokens[i][1] === '/' && tokens[i][2] === 'array') {
          i++;
          return a;
        }
        a.push(value());
      }
    }
    if (selfClose) return '';
    const t = unesc(text());
    i++;
    return name === 'integer' || name === 'real' ? Number(t) : t;
  }
  while (tokens[i] && !(tokens[i][2] === 'plist' && !tokens[i][1])) i++;
  i++;
  return value();
}
