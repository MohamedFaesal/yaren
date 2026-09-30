export function Mark({ light = false }: { light?: boolean }) {
  const leaf = light ? "#7ec8c4" : "#0D7377";
  const gold = "#C9973F";
  const ink = light ? "#F7F3EA" : "#0B3142";
  return (
    <span className={`brand ${light ? "on-navy" : ""}`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <path d="M36 8c-6 12-16 22-16 34a16 16 0 0 0 32 0C52 30 42 20 36 8z" fill={leaf} />
        <path d="M36 18c-3 7-8 12-8 20a8 8 0 0 0 16 0c0-8-5-13-8-20z" fill={light ? "#0B3142" : "#F7F3EA"} opacity="0.35" />
        <path d="M16 50c8 12 32 12 40 0" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span>
        <strong style={{ color: ink }}>YAREN</strong>
        <em>HEALTHCARE</em>
      </span>
    </span>
  );
}
