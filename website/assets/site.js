// Screenshot lightbox: buttons with data-zoom="<dialog id>" open that <dialog> as a modal.
// Esc closes it (native), as does any click: the close button, the image (zoom-out cursor)
// or the dark backdrop.
for (const trigger of document.querySelectorAll('[data-zoom]')) {
  const dialog = document.getElementById(trigger.dataset.zoom);
  if (!(dialog instanceof HTMLDialogElement)) continue;

  trigger.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', () => dialog.close());
  // Return focus to the thumbnail, so keyboard users continue where they were.
  dialog.addEventListener('close', () => trigger.focus());
}
