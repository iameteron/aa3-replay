// Each printed gridmap row describes the frame following the last action above it.
export function gridMap(sudoku, card, step) {
  if (!sudoku?.mapTurns.includes(card.turn)) return null;
  const cells = [];
  if (card.kind === 'result') {
    const frameAtLine = new Map(card.actions.map(a => [a.line, a.frame]));
    let frame = card.frame;
    card.text.split('\n').forEach((text, line) => {
      frame = frameAtLine.get(line) ?? frame;
      if (frame !== step.frame) return;
      const match = /^\(([0-3]),\s*([0-3])\)\s+\[/.exec(text);
      if (!match) return;
      const boxes = Array.from(text.matchAll(/\((\d+), (\d+), (\d+), (\d+)\)/g),
        box => box.slice(1).map(Number));
      cells.push({row:Number(match[1]), col:Number(match[2]), line, boxes});
    });
  }
  if (card.kind !== 'python' && !cells.length) return null;
  return {origin:sudoku.origin, pitch:sudoku.pitch, cells};
}

export function drawGrid(ctx, map, cell) {
  const origin = 10 * map.origin, pitch = 10 * map.pitch;
  ctx.save();
  ctx.font = 'bold 21px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const mid = origin + (i + 0.5) * pitch;
    for (const [x,y] of [[mid,origin-17],[origin-17,mid]]) {
      ctx.fillStyle = '#18282c'; ctx.fillRect(x-13,y-13,26,26);
      ctx.fillStyle = '#afe9da'; ctx.fillText(i,x,y);
    }
  }
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = origin + col * pitch, y = origin + row * pitch;
      ctx.strokeStyle = 'rgba(111,224,199,.72)'; ctx.lineWidth = 2;
      ctx.strokeRect(x+2,y+2,pitch-4,pitch-4);
    }
  }
  if (cell) {
    const x = origin + cell.col * pitch, y = origin + cell.row * pitch;
    ctx.fillStyle = 'rgba(95,235,204,.18)'; ctx.fillRect(x,y,pitch,pitch);
    ctx.strokeStyle = '#102523'; ctx.lineWidth = 8; ctx.strokeRect(x+4,y+4,pitch-8,pitch-8);
    ctx.strokeStyle = '#83ffe0'; ctx.lineWidth = 4; ctx.strokeRect(x+4,y+4,pitch-8,pitch-8);
    ctx.lineWidth = 2;
    for (const [r0,c0,r1,c1] of cell.boxes) {
      ctx.strokeRect(c0*10,r0*10,(c1-c0+1)*10,(r1-r0+1)*10);
    }
  }
  ctx.restore();
}

export function showSolution(sudoku, card, frame) {
  const solution = sudoku?.solutions.find(s => s.level === frame.level &&
    (card.turn > s.turn || (card.turn === s.turn && card.kind === 'result')));
  const panel = document.getElementById('solution');
  panel.hidden = !solution;
  if (!solution) return;
  document.getElementById('solution-solver').textContent = solution.solver;
  const grid = document.getElementById('solution-grid');
  const frag = document.createDocumentFragment();
  for (const [row, values] of solution.values.entries()) {
    for (const [col, value] of values.entries()) {
      const el = document.createElement('span');
      const filled = solution.filled.some(([r,c]) => r === row && c === col);
      el.classList.toggle('filled', filled);
      el.textContent = value;
      el.setAttribute('aria-label', '(' + row + ', ' + col + ') ' + value + (filled ? ', нашёл агент' : ', дано'));
      frag.append(el);
    }
  }
  grid.replaceChildren(frag);
}
