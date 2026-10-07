export function getStarColor(stars: number): string {
  if (stars < 0.1) return "#AAAAAA";
  if (stars < 1.25) return "#4290FB";
  if (stars < 2.0) return "#4FC0FF";
  if (stars < 2.5) return "#4FFFD5";
  if (stars < 3.3) return "#7CFF4F";
  if (stars < 4.2) return "#F6F05C";
  if (stars < 4.9) return "#FF8068";
  if (stars < 5.8) return "#FF4E6F";
  if (stars < 6.7) return "#C645B8";
  if (stars < 7.7) return "#6563DF";
  return "#18158E";
}

export function formatStars(stars: number): string {
  return (Math.round(stars * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
}
