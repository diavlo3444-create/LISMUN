import React from 'react';
import type { ExperienceStageId } from '../types/atlas';

interface ExperiencePlateProps {
  stageId: ExperienceStageId;
  className?: string;
}

export const ExperienceEngravedPlate: React.FC<ExperiencePlateProps> = ({
  stageId,
  className = '',
}) => {
  if (stageId === 'research') {
    return (
      <svg
        viewBox="0 0 560 400"
        className={`h-full w-full ${className}`}
        role="img"
        aria-label="Engraved archival treaty folio and research annotation plate"
      >
        <rect width="560" height="400" fill="#071426" />
        {/* Archival grid */}
        <g stroke="#263D59" strokeWidth="0.6" strokeOpacity="0.45">
          {[80, 160, 240, 320, 400, 480].map((x) => (
            <line key={`vx-${x}`} x1={x} y1="0" x2={x} y2="400" />
          ))}
          {[80, 160, 240, 320].map((y) => (
            <line key={`hy-${y}`} x1="0" y1={y} x2="560" y2={y} />
          ))}
        </g>

        {/* Treaty Open Folio */}
        <g stroke="#B89A62" fill="none" strokeWidth="1.1">
          <rect x="64" y="46" width="432" height="308" strokeOpacity="0.35" />
          <path d="M 84 68 L 274 74 L 274 334 L 84 328 Z" fill="#0A1B33" strokeOpacity="0.7" />
          <path d="M 476 68 L 286 74 L 286 334 L 476 328 Z" fill="#0A1B33" strokeOpacity="0.7" />
          <line x1="280" y1="68" x2="280" y2="338" stroke="#D5BD8B" strokeWidth="1.2" />
        </g>

        {/* Left Folio Charter Lines & Drop Cap */}
        <g stroke="#E8E1D2" strokeOpacity="0.42" strokeWidth="1">
          <rect x="106" y="96" width="32" height="34" fill="none" stroke="#B89A62" strokeOpacity="0.8" />
          <text
            x="122"
            y="122"
            textAnchor="middle"
            fill="#D5BD8B"
            fontSize="24"
            fontFamily="Cormorant Garamond, serif"
          >
            A
          </text>
          {[104, 118, 132].map((y) => (
            <line key={y} x1="148" y1={y} x2="252" y2={y} />
          ))}
          {[156, 170, 184, 198, 212, 232, 246, 260, 274, 288].map((y, idx) => (
            <line
              key={y}
              x1="106"
              y1={y}
              x2={idx % 4 === 3 ? 210 : 252}
              y2={y}
            />
          ))}
        </g>

        {/* Right Folio Cartographic Diagram & Annotations */}
        <g stroke="#B89A62" fill="none">
          <circle cx="382" cy="168" r="64" strokeOpacity="0.55" strokeDasharray="3 4" />
          <circle cx="382" cy="168" r="42" strokeOpacity="0.85" />
          <line x1="306" y1="168" x2="458" y2="168" stroke="#263D59" />
          <line x1="382" y1="92" x2="382" y2="244" stroke="#263D59" />
          {/* Animated callout annotation */}
          <path
            data-plate-draw="true"
            d="M 382 168 L 418 118 L 456 118"
            stroke="#D5BD8B"
            strokeWidth="1.3"
          />
          <circle cx="382" cy="168" r="3.5" fill="#D5BD8B" />
          <text
            x="312"
            y="272"
            fill="#E8E1D2"
            fillOpacity="0.7"
            fontSize="10"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="1.6"
          >
            ART. IV · SOVEREIGN DOSSIER
          </text>
          <line x1="312" y1="286" x2="452" y2="286" strokeOpacity="0.4" />
          <line x1="312" y1="300" x2="424" y2="300" strokeOpacity="0.3" />
        </g>
      </svg>
    );
  }

  if (stageId === 'debate') {
    return (
      <svg
        viewBox="0 0 560 400"
        className={`h-full w-full ${className}`}
        role="img"
        aria-label="Architectural elevation of hemispherical assembly chamber"
      >
        <rect width="560" height="400" fill="#071426" />
        {/* Acoustic Dome Ribs */}
        <g stroke="#263D59" fill="none" strokeWidth="0.9">
          <path d="M 40 340 A 240 240 0 0 1 520 340" />
          <path d="M 85 340 A 195 195 0 0 1 475 340" />
          <path d="M 130 340 A 150 150 0 0 1 430 340" />
          <path d="M 175 340 A 105 105 0 0 1 385 340" />
        </g>

        {/* Tiered Hemispherical Delegate Seating */}
        <g stroke="#B89A62" fill="none" strokeWidth="1.15">
          {[96, 126, 156, 186].map((r, i) => (
            <path
              key={r}
              d={`M ${280 - r} 310 A ${r} ${r * 0.72} 0 0 1 ${280 + r} 310`}
              strokeOpacity={0.8 - i * 0.14}
            />
          ))}
        </g>

        {/* Central Dais & Speakers Lectern */}
        <g stroke="#D5BD8B" fill="#0A1B33" strokeWidth="1.2">
          <rect x="232" y="294" width="96" height="42" />
          <rect x="266" y="256" width="28" height="38" />
          <line x1="258" y1="256" x2="302" y2="256" strokeWidth="1.8" />
        </g>

        {/* Opposing Debate Vectors Converging */}
        <g fill="none">
          <path
            data-plate-draw="true"
            d="M 56 124 C 142 124, 200 184, 274 248"
            stroke="#D5BD8B"
            strokeWidth="1.4"
          />
          <path
            data-plate-draw="true"
            d="M 504 124 C 418 124, 360 184, 286 248"
            stroke="#B89A62"
            strokeWidth="1.4"
          />
          <circle cx="280" cy="248" r="4" fill="#E8E1D2" />
        </g>

        <text
          x="280"
          y="58"
          textAnchor="middle"
          fill="#B89A62"
          fontSize="10"
          fontFamily="IBM Plex Mono, monospace"
          letterSpacing="2.4"
        >
          ASSEMBLY CHAMBER · PLAN &amp; ELEVATION
        </text>
      </svg>
    );
  }

  if (stageId === 'diplomacy') {
    return (
      <svg
        viewBox="0 0 560 400"
        className={`h-full w-full ${className}`}
        role="img"
        aria-label="Classical diplomatic colonnade and meridian lines"
      >
        <rect width="560" height="400" fill="#071426" />
        {/* Classical Entablature & Pediment */}
        <g stroke="#B89A62" fill="none" strokeWidth="1.15">
          <polygon points="62,102 280,44 498,102" fill="#0B1D36" strokeOpacity="0.8" />
          <line x1="62" y1="116" x2="498" y2="116" strokeOpacity="0.7" />
          <line x1="52" y1="342" x2="508" y2="342" strokeOpacity="0.8" />
          <line x1="40" y1="354" x2="520" y2="354" strokeOpacity="0.45" />
        </g>

        {/* Classical Fluted Columns */}
        {[98, 170, 242, 318, 390, 462].map((cx) => (
          <g key={cx} stroke="#D5BD8B" strokeOpacity="0.62" fill="#091930" strokeWidth="1">
            <rect x={cx - 12} y="116" width="24" height="226" />
            <line x1={cx - 4} y1="122" x2={cx - 4} y2="336" strokeOpacity="0.35" />
            <line x1={cx + 4} y1="122" x2={cx + 4} y2="336" strokeOpacity="0.35" />
          </g>
        ))}

        {/* Geodesic Diplomatic Corridor Arcs */}
        <g fill="none">
          <path
            data-plate-draw="true"
            d="M 40 248 Q 280 142 520 248"
            stroke="#D5BD8B"
            strokeWidth="1.5"
          />
          <path
            data-plate-draw="true"
            d="M 40 278 Q 280 198 520 278"
            stroke="#B89A62"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          {[98, 280, 462].map((x, idx) => (
            <circle key={x} cx={x} cy={idx === 1 ? 195 : 226} r="3.5" fill="#E8E1D2" />
          ))}
        </g>
      </svg>
    );
  }

  // Resolution wide charter plate
  return (
    <svg
      viewBox="0 0 880 380"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label="Wide sovereign conference resolution charter and compass seal"
    >
      <rect width="880" height="380" fill="#071426" />
      <g stroke="#263D59" strokeWidth="0.7" strokeOpacity="0.5" fill="none">
        <line x1="0" y1="190" x2="880" y2="190" />
        <line x1="440" y1="0" x2="440" y2="380" />
        <circle cx="440" cy="190" r="142" />
        <circle cx="440" cy="190" r="220" strokeDasharray="3 6" />
      </g>

      {/* Panoramic Charter Frame */}
      <rect
        x="48"
        y="36"
        width="784"
        height="308"
        fill="none"
        stroke="#B89A62"
        strokeWidth="1.1"
        strokeOpacity="0.55"
      />
      <rect
        x="60"
        y="48"
        width="760"
        height="284"
        fill="none"
        stroke="#263D59"
        strokeWidth="0.8"
      />

      {/* Left & Right Signatory Ledger Columns */}
      <g stroke="#E8E1D2" strokeOpacity="0.38" strokeWidth="1">
        {[110, 134, 158, 182, 206, 230, 254].map((y) => (
          <React.Fragment key={y}>
            <line x1="92" y1={y} x2="262" y2={y} />
            <line x1="618" y1={y} x2="788" y2={y} />
          </React.Fragment>
        ))}
      </g>

      {/* Central Ratification Seal & Completing Gold Route */}
      <g fill="none">
        <circle cx="440" cy="190" r="76" stroke="#D5BD8B" strokeWidth="1.35" data-plate-draw="true" />
        <circle cx="440" cy="190" r="56" stroke="#B89A62" strokeWidth="0.9" strokeOpacity="0.7" />
        <path
          data-plate-draw="true"
          d="M 60 190 L 364 190 M 516 190 L 820 190"
          stroke="#D5BD8B"
          strokeWidth="1.2"
        />
        <text
          x="440"
          y="186"
          textAnchor="middle"
          fill="#E8E1D2"
          fontSize="16"
          fontFamily="Cormorant Garamond, serif"
          letterSpacing="3"
        >
          FINAL ACT
        </text>
        <text
          x="440"
          y="206"
          textAnchor="middle"
          fill="#B89A62"
          fontSize="9"
          fontFamily="IBM Plex Mono, monospace"
          letterSpacing="2"
        >
          SESSION I · RATIFIED
        </text>
      </g>
    </svg>
  );
};

interface SecretariatPlinthProps {
  accessionCode: string;
  romanNumeral: string;
  isActive?: boolean;
}

export const SecretariatPlinthPlate: React.FC<SecretariatPlinthProps> = ({
  accessionCode,
  romanNumeral,
  isActive = false,
}) => {
  return (
    <svg
      viewBox="0 0 320 410"
      className="h-full w-full"
      role="img"
      aria-label={`Archival institutional plinth for ${accessionCode}`}
    >
      <defs>
        <linearGradient id="plinthShade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0D1E36" />
          <stop offset="100%" stopColor="#030914" />
        </linearGradient>
      </defs>
      <rect width="320" height="410" fill="url(#plinthShade)" />

      {/* Subtle longitude meridian backdrop */}
      <g stroke="#263D59" strokeWidth="0.7" strokeOpacity="0.45" fill="none">
        <circle cx="160" cy="168" r="108" />
        <ellipse cx="160" cy="168" rx="58" ry="108" />
        <line x1="160" y1="24" x2="160" y2="386" />
        <line x1="24" y1="168" x2="296" y2="168" />
      </g>

      {/* Architectural Portrait Pedestal / Silhouette */}
      <g
        stroke={isActive ? '#D5BD8B' : '#B89A62'}
        strokeOpacity={isActive ? 0.95 : 0.55}
        fill="none"
        strokeWidth="1.2"
      >
        <path d="M 96 364 L 224 364 L 214 334 L 106 334 Z" fill="#071426" />
        <path d="M 118 334 L 126 196 L 194 196 L 202 334 Z" fill="#091930" />
        <circle cx="160" cy="140" r="36" fill="#071426" />
        <circle
          cx="160"
          cy="140"
          r="58"
          strokeDasharray="4 7"
          strokeOpacity={isActive ? 0.85 : 0.35}
          className="atlas-ambient-orbit"
        />
      </g>

      <text
        x="160"
        y="272"
        textAnchor="middle"
        fill={isActive ? '#E8E1D2' : '#B89A62'}
        fontSize="44"
        fontFamily="Cormorant Garamond, serif"
        letterSpacing="2"
      >
        {romanNumeral}
      </text>

      {/* Corner calibration ticks */}
      <g stroke="#B89A62" strokeWidth="1" strokeOpacity="0.7">
        <path d="M 18 34 L 18 18 L 34 18" fill="none" />
        <path d="M 286 18 L 302 18 L 302 34" fill="none" />
        <path d="M 18 376 L 18 392 L 34 392" fill="none" />
        <path d="M 286 392 L 302 392 L 302 376" fill="none" />
      </g>
    </svg>
  );
};
