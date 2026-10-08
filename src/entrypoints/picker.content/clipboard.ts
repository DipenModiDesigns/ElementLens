/** Copy text, falling back to execCommand on non-secure (http) pages without the async clipboard API. */
export async function copyText(text: string, container: Node & ParentNode): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('style', 'position: fixed; top: 0; left: -9999px; opacity: 0;');
    container.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
