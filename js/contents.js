const contents = document.querySelector('#page-contents');
if (contents) {
  contents.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') contents.open = true;
  });
  contents.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && !contents.matches(':focus-within')) contents.open = false;
  });
  contents.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      contents.open = false;
      contents.querySelector('summary').focus();
    }
  });
  contents.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { contents.open = false; }));
}
