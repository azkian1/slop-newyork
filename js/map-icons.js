// Minimap and street-map marks for the wandering bot and the dropped objects.

export function drawGrokIcon(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#111114';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(186, 164, 240, 0.95)';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, -0.35, 1.05);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const ew = Math.max(1.3, r * 0.16);
  const eh = r * 0.62;
  const gap = r * 0.22;
  const left = x + r * 0.06;
  const top = y - eh * 0.5;
  const pill = (px) => {
    ctx.beginPath();
    ctx.ellipse(px + ew * 0.5, y, ew * 0.5, eh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  pill(left);
  pill(left + ew + gap);
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
