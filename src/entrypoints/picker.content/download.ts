/** Save text as a file via a temporary blob link (no downloads permission needed). */
export function downloadText(filename: string, text: string, type: string, container: Node & ParentNode) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox only follows links that are in the document.
  container.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
