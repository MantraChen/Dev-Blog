export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const parts = [];
  let offset = 0,
    index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  while (index >= 0 && parts.length < 100) {
    parts.push(
      text.slice(offset, index),
      <mark key={index} className="rounded bg-amber-300/40 text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    offset = index + needle.length;
    index = text
      .toLocaleLowerCase()
      .indexOf(needle.toLocaleLowerCase(), offset);
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
