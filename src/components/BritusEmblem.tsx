import React from 'react';
import { LISMUN_EMBLEM_IMAGE_PATH } from '../data/conferenceData';

interface BritusEmblemProps {
  className?: string;
  size?: number;
  variant?: 'engraved' | 'seal' | 'layered';
  sealOpacity?: number;
  showCaption?: boolean;
  animated?: boolean;
}

export const BritusEmblem: React.FC<BritusEmblemProps> = ({
  className = '',
  size = 240,
  variant = 'layered',
  sealOpacity = 0.92,
  showCaption = false,
  animated = false,
}) => {
  if (variant === 'seal') {
    return (
      <div
        className={`relative inline-flex flex-col items-center ${className}`}
        style={{ width: size }}
      >
        <div
          className="relative overflow-hidden rounded-full border border-[#B89A62]/45 bg-[#071426] shadow-2xl"
          style={{ width: size, height: size }}
        >
          <img
            src={LISMUN_EMBLEM_IMAGE_PATH}
            alt="Leadership International School MUN Official Emblem"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-[#D5BD8B]/25"
            aria-hidden="true"
          />
        </div>
        {showCaption && (
          <p className="mt-3 text-center font-mono text-[11px] tracking-[0.22em] text-[#B89A62]/85 uppercase">
            Official Institutional Seal · Session I
          </p>
        )}
      </div>
    );
  }

  // Faithful separated SVG vector layers complementing the official conference seal
  return (
    <div
      className={`relative inline-flex flex-col items-center ${className}`}
      style={{ width: size }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {variant === 'layered' && (
          <img
            src={LISMUN_EMBLEM_IMAGE_PATH}
            alt="Leadership International School MUN Official Emblem"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full rounded-full object-cover transition-opacity duration-700"
            style={{ opacity: sealOpacity }}
          />
        )}

        <svg
          viewBox="0 0 320 320"
          className="relative z-10 h-full w-full overflow-visible"
          role="img"
          aria-label="Leadership International School MUN Crest"
        >
          <defs>
            <radialGradient id="lismunDiscGrad" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#132540" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#030914" stopOpacity="0.85" />
            </radialGradient>
          </defs>

          {/* Outer calibration rings */}
          <circle
            data-emblem-part="ring"
            cx="160"
            cy="160"
            r="150"
            fill={variant === 'engraved' ? 'url(#lismunDiscGrad)' : 'none'}
            stroke="#B89A62"
            strokeWidth="1"
            strokeOpacity="0.65"
            strokeDasharray={animated ? '14 6' : undefined}
            className={animated ? 'atlas-ambient-orbit-reverse' : undefined}
          />
          <circle
            data-emblem-part="ring-inner"
            cx="160"
            cy="160"
            r="142"
            fill="none"
            stroke="#D5BD8B"
            strokeOpacity={animated ? '0.55' : '0.45'}
            strokeWidth="0.85"
            strokeDasharray="3 6"
            className={animated ? 'atlas-ambient-orbit' : undefined}
          />

          {/* Graticule Globe Lines */}
          <g data-emblem-part="globe" stroke="#263D59" strokeWidth="0.9" fill="none">
            <circle cx="160" cy="148" r="96" stroke="#B89A62" strokeOpacity="0.45" />
            <ellipse cx="160" cy="148" rx="64" ry="96" />
            <ellipse cx="160" cy="148" rx="32" ry="96" />
            <line x1="160" y1="52" x2="160" y2="244" />
            <line x1="64" y1="148" x2="256" y2="148" />
            <path d="M 74 106 Q 160 118 246 106" />
            <path d="M 74 190 Q 160 178 246 190" />
            <path d="M 96 76 Q 160 88 224 76" />
          </g>

          {/* Symmetrical Laurel Wreaths */}
          <g
            data-emblem-part="laurel"
            fill="none"
            stroke="#D5BD8B"
            strokeWidth="1.25"
            strokeLinecap="round"
          >
            {/* Left stem */}
            <path d="M 118 246 C 68 224, 48 164, 58 106 C 64 78, 84 54, 106 44" />
            {/* Right stem */}
            <path d="M 202 246 C 252 224, 272 164, 262 106 C 256 78, 236 54, 214 44" />

            {/* Left laurel leaves */}
            {[
              [96, 234, -35],
              [78, 212, -48],
              [65, 186, -65],
              [57, 158, -80],
              [56, 130, -95],
              [62, 102, -110],
              [74, 76, -128],
              [92, 56, -145],
            ].map(([cx, cy, rot], idx) => (
              <path
                key={`ll-${idx}`}
                d="M 0 0 C -6 -10, -4 -22, 0 -28 C 6 -20, 6 -10, 0 0 Z"
                transform={`translate(${cx}, ${cy}) rotate(${rot})`}
              />
            ))}

            {/* Right laurel leaves */}
            {[
              [224, 234, 35],
              [242, 212, 48],
              [255, 186, 65],
              [263, 158, 80],
              [264, 130, 95],
              [258, 102, 110],
              [246, 76, 128],
              [228, 56, 145],
            ].map(([cx, cy, rot], idx) => (
              <path
                key={`rl-${idx}`}
                d="M 0 0 C -6 -10, -4 -22, 0 -28 C 6 -20, 6 -10, 0 0 Z"
                transform={`translate(${cx}, ${cy}) rotate(${rot})`}
              />
            ))}
          </g>

          {/* Open Book at Base */}
          <g
            data-emblem-part="book"
            fill="none"
            stroke="#D5BD8B"
            strokeWidth="1.25"
            strokeLinejoin="round"
          >
            <path d="M 86 266 L 160 272 L 234 266 L 228 242 C 204 236, 178 240, 160 252 C 142 240, 116 236, 92 242 Z" />
            <path d="M 160 252 L 160 272" />
            <path d="M 100 249 C 122 245, 142 248, 154 256" strokeOpacity="0.65" />
            <path d="M 102 256 C 122 252, 142 255, 154 263" strokeOpacity="0.65" />
            <path d="M 220 249 C 198 245, 178 248, 166 256" strokeOpacity="0.65" />
            <path d="M 218 256 C 198 252, 178 255, 166 263" strokeOpacity="0.65" />
          </g>

          {/* Classical Podium / Roman Numeral I Column */}
          <g
            data-emblem-part="pillar"
            fill="none"
            stroke="#B89A62"
            strokeWidth="1.35"
            strokeLinejoin="round"
          >
            <path d="M 134 156 L 186 156 L 186 164 L 176 174 L 170 232 L 178 238 L 142 238 L 150 232 L 144 174 L 134 164 Z" />
            <line x1="138" y1="162" x2="182" y2="162" strokeOpacity="0.7" />
          </g>

          {/* LISMUN Shield / Crest */}
          <g data-emblem-part="shield">
            <path
              d="M 136 86 L 184 86 L 184 122 C 184 139, 172 150, 160 154 C 148 150, 136 139, 136 122 Z"
              fill={variant === 'engraved' ? '#071426' : 'transparent'}
              stroke="#D5BD8B"
              strokeWidth="1.3"
            />
            <path
              d="M 136 86 L 184 86 L 184 102 L 136 102 Z"
              fill={variant === 'engraved' ? '#7F1D26' : 'transparent'}
              stroke="#D5BD8B"
              strokeWidth="1"
            />
            {variant === 'engraved' && (
              <>
                <text
                  x="160"
                  y="97.5"
                  textAnchor="middle"
                  fill="#E8E1D2"
                  fontSize="9"
                  fontFamily="Cormorant Garamond, Georgia, serif"
                  letterSpacing="1.6"
                  fontWeight="600"
                >
                  LISMUN
                </text>
                {/* Four-pointed star lattice inside shield */}
                <path
                  d="M 152 114 L 168 114 L 168 130 L 152 130 Z"
                  fill="none"
                  stroke="#E8E1D2"
                  strokeWidth="1"
                />
                <path
                  d="M 160 112 L 162.8 119.2 L 170 122 L 162.8 124.8 L 160 132 L 157.2 124.8 L 150 122 L 157.2 119.2 Z"
                  fill="#E8E1D2"
                />
              </>
            )}
          </g>
        </svg>
      </div>
      {showCaption && (
        <p className="mt-3 text-center font-mono text-[11px] tracking-[0.22em] text-[#B89A62]/85 uppercase">
          Official Institutional Seal · Session I
        </p>
      )}
    </div>
  );
};
