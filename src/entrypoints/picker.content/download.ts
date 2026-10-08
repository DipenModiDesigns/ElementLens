/** Save text as a file via a temporary blob link (no downloads permission needed). */
export function downloadText(filename: string, text: string, type: string, container: Node & ParentNode) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox only follows links that are in the document.
  container.append(link);
  link.click();
  // The browser starts the download asynchronously after the click. Removing the link or
  // revoking the URL right away can make it drop the download silently, so clean up later.
  setTimeout(() => link.remove(), 1000);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
