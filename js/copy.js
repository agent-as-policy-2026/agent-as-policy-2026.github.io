/* copy.js - the BibTeX copy button. The entry itself is on the page as text, so this is
   a convenience and never the only way to get it. */

const button = document.getElementById('agp-copy-bibtex');
const block = document.getElementById('agp-bibtex');

if (button && block) {
  button.hidden = false;
  let timer = null;

  async function copy() {
    const text = block.textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'absolute';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  button.addEventListener('click', async () => {
    const ok = await copy();
    button.textContent = ok ? button.dataset.done : 'Select the text above to copy it';
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = button.dataset.label; }, 2600);
  });
}
