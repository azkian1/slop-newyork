// Minimap and street-map marks for the wandering bot and the dropped objects.

export function drawGrokIcon(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#f4f4f5';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1e';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.fillStyle = '#141414';
  const ew = Math.max(1.3, r * 0.16);
  const eh = r * 0.55;
  const gap = r * 0.2;
  const pill = (px, py) => {
    ctx.beginPath();
    ctx.ellipse(px, py, ew * 0.5, eh * 0.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  pill(x + r * 0.05, y - r * 0.08);
  pill(x + r * 0.05 + ew + gap, y - r * 0.28);
  ctx.restore();
}

export function drawDropIcon(ctx, x, y, thumb, size) {
  if (!thumb || size < 8) {
    ctx.save();
    ctx.fillStyle = '#ff00c8';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.5, size * 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const h = size * (thumb.height / thumb.width);
  ctx.drawImage(thumb, x - size * 0.5, y - h * 0.5, size, h);
}
