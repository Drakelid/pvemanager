/**
 * Декоративный геометрический паттерн для левой панели страницы входа.
 * Тонкие полупрозрачные линии (круги, квадраты, треугольники, ломаные),
 * бесшовно повторяющиеся через SVG <pattern>. Цвет линий — currentColor.
 */
export default function AuthPattern({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="auth-geo"
          width="200"
          height="200"
          patternUnits="userSpaceOnUse"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity="0.5"
          >
            {/* сетка-рамки */}
            <rect x="0.5" y="0.5" width="199" height="199" />
            {/* круг */}
            <circle cx="100" cy="60" r="46" />
            {/* квадрат со срезом-диагональю */}
            <rect x="20" y="120" width="56" height="56" />
            <line x1="20" y1="176" x2="76" y2="120" />
            {/* треугольники из диагоналей */}
            <path d="M120 120 L176 120 L176 176 Z" />
            <path d="M120 176 L120 120 L176 176 Z" strokeOpacity="0.25" />
            {/* ломаная линия */}
            <path d="M0 40 L40 40 L40 80 L0 80" strokeOpacity="0.35" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-geo)" />
    </svg>
  );
}
