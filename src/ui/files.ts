/** Saves text as a file the browser downloads (on phones: the share/save sheet or Files). */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lets the user choose a file and hands over its text. Nothing happens if they cancel. */
export function pickTextFile(accept: string, onText: (text: string) => void, onError: () => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(onText, onError);
  });
  input.click();
}
