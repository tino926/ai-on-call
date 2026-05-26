const MAX_CHUNK_LENGTH = 4000;

export function splitMessage(text: string): string[] {
  if (text.length <= MAX_CHUNK_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (text.length - start <= MAX_CHUNK_LENGTH) {
      chunks.push(text.slice(start));
      break;
    }

    const end = start + MAX_CHUNK_LENGTH;

    const newlinePos = text.lastIndexOf('\n', end);
    if (newlinePos > start + 1) {
      chunks.push(text.slice(start, newlinePos));
      start = newlinePos + 1;
      continue;
    }

    const spacePos = text.lastIndexOf(' ', end);
    if (spacePos > start + 1) {
      chunks.push(text.slice(start, spacePos));
      start = spacePos + 1;
      continue;
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  if (chunks.length > 1) {
    const total = chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      chunks[i] = chunks[i] + `\n\n(${i + 1}/${total})`;
    }
  }

  return chunks;
}
