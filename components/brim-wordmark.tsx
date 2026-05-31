// Vector "BRIM IT" wordmark, rendered as inline SVG so it inherits the site font
// (--font-sans / Arimo) and stays crisp at any size — unlike the old 435×87 PNG,
// which blurred when the hero scaled it up. Brand cyan→teal gradient.
// `className` controls the rendered size (set a height; width is auto via the 5:1 viewBox).

export function BrimWordmark({ className = "", title = "Brim It" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 435 87"
      role="img"
      aria-label={title}
      className={className}
      style={{ width: "auto" }}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="brim-wordmark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2cd0e6" />
          <stop offset="55%" stopColor="#00c1d5" />
          <stop offset="100%" stopColor="#0aa7bf" />
        </linearGradient>
      </defs>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-sans"
        fontSize="78"
        fontWeight={700}
        letterSpacing="-1"
        fill="url(#brim-wordmark-grad)"
      >
        BRIM IT
      </text>
    </svg>
  );
}
