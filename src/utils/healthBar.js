export function getHealthBar(hp) {
  const full = "█";
  const empty = "░";
  const totalBars = 10;
  const filledBars = Math.max(0, Math.floor((hp / 100) * totalBars));
  return full.repeat(filledBars) + empty.repeat(totalBars - filledBars);
}