// Region selection overlay. Shows a frozen picture of the display and reports the dragged
// rectangle (in window coordinates) back to the main process, or null when cancelled.
const shot = document.getElementById('shot');
const shade = document.getElementById('shade');
const box = document.getElementById('box');
const sizeLabel = document.getElementById('size');
const hint = document.getElementById('hint');

let start = null;
let rect = null;
let done = false;

function finish(result) {
  if (done) return;
  done = true;
  window.regionSelect.done(result);
}

window.regionSelect.onImage((dataUrl) => {
  shot.src = dataUrl;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') finish(null);
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  finish(null);
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  start = { x: e.clientX, y: e.clientY };
  rect = { x: start.x, y: start.y, width: 0, height: 0 };
  hint.style.display = 'none';
});

window.addEventListener('mousemove', (e) => {
  if (!start) return;
  rect = {
    x: Math.min(start.x, e.clientX),
    y: Math.min(start.y, e.clientY),
    width: Math.abs(e.clientX - start.x),
    height: Math.abs(e.clientY - start.y)
  };
  shade.style.display = 'none';
  Object.assign(box.style, {
    display: 'block',
    left: rect.x + 'px',
    top: rect.y + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px'
  });
  sizeLabel.textContent = Math.round(rect.width * devicePixelRatio) + ' × ' + Math.round(rect.height * devicePixelRatio);
  sizeLabel.style.display = 'block';
  sizeLabel.style.left = rect.x + 'px';
  sizeLabel.style.top = (rect.y > 26 ? rect.y - 24 : rect.y + rect.height + 4) + 'px';
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !start) return;
  start = null;
  if (!rect || rect.width < 3 || rect.height < 3) {
    // A click without a drag: start over instead of saving a 1-pixel image.
    rect = null;
    box.style.display = 'none';
    sizeLabel.style.display = 'none';
    shade.style.display = 'block';
    hint.style.display = 'block';
    return;
  }
  finish(rect);
});
