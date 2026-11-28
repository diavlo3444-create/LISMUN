import React from 'react';
import type { ChessPieceType, ChessSide } from '../../data/executiveBoardData';

interface ChessPieceGlyphProps {
  pieceType: ChessPieceType;
  side?: ChessSide;
  size?: number;
  className?: string;
}

export const ChessPieceGlyph: React.FC<ChessPieceGlyphProps> = ({
  pieceType,
  side = 'gold',
  size = 24,
  className = '',
}) => {
  const fill = side === 'gold' ? '#D5BD8B' : '#1E4172';
  const stroke = side === 'gold' ? '#7D6333' : '#D5BD8B';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {pieceType === 'king' && (
        <g stroke={stroke} strokeWidth="1.25" strokeLinejoin="round">
          <path d="M16 3v4M14 5h4" strokeLinecap="round" />
          <path
            d="M11 11c0-2.2 2.2-3.5 5-3.5s5 1.3 5 3.5l-1.5 9.5h-7L11 11Z"
            fill={fill}
          />
          <path d="M9.5 23.5h13l1.5 3.5H8l1.5-3.5Z" fill={fill} />
          <path d="M10.5 20.5h11" strokeLinecap="round" />
        </g>
      )}
      {pieceType === 'queen' && (
        <g stroke={stroke} strokeWidth="1.25" strokeLinejoin="round">
          <circle cx="8.5" cy="7.5" r="1.2" fill={fill} />
          <circle cx="16" cy="5.5" r="1.3" fill={fill} />
          <circle cx="23.5" cy="7.5" r="1.2" fill={fill} />
          <path
            d="M9 9.5 12.5 14 16 7.5 19.5 14 23 9.5l-2 11h-10l-2-11Z"
            fill={fill}
          />
          <path d="M9 23.5h14l1.5 3.5H7.5L9 23.5Z" fill={fill} />
        </g>
      )}
      {pieceType === 'rook' && (
        <g stroke={stroke} strokeWidth="1.25" strokeLinejoin="round">
          <path
            d="M9.5 6.5h3v2.5h2V6.5h3v2.5h2V6.5h3v5.5l-1.5 1.5v7h-10v-7L9.5 12V6.5Z"
            fill={fill}
          />
          <path d="M8.5 23.5h15l1.5 3.5H7l1.5-3.5Z" fill={fill} />
        </g>
      )}
      {pieceType === 'bishop' && (
        <g stroke={stroke} strokeWidth="1.25" strokeLinejoin="round">
          <circle cx="16" cy="5.5" r="1.5" fill={fill} />
          <path
            d="M16 7.5c-3.3 2.3-4.5 5.4-3.5 8.5l-1.3 4.5h9.6L19.5 16c1-3.1-.2-6.2-3.5-8.5Z"
            fill={fill}
          />
          <path d="M14.2 12.5 18 15" strokeLinecap="round" />
          <path d="M9.5 23.5h13l1.5 3.5H8l1.5-3.5Z" fill={fill} />
        </g>
      )}
      {pieceType === 'knight' && (
        <g stroke={stroke} strokeWidth="1.25" strokeLinejoin="round">
          <path
            d="M11 20.5c-.6-4.4.8-8.2 3.2-10.8L13 6.5l3.2 1.8c3.6.4 6.5 2.4 7.3 5.2l-3.8 1.3-1.7-1.1c.6 2 .5 4.4-.5 6.8H11Z"
            fill={fill}
          />
          <path d="M9 23.5h14l1.5 3.5H7.5L9 23.5Z" fill={fill} />
        </g>
      )}
      {pieceType === 'pawn' && (
        <g stroke={stroke} strokeWidth="1.25" strokeLinejoin="round">
          <circle cx="16" cy="10" r="3.6" fill={fill} />
          <path d="M13 14.5h6l1.2 6h-8.4l1.2-6Z" fill={fill} />
          <path d="M9.5 23.5h13l1.5 3.5H8l1.5-3.5Z" fill={fill} />
        </g>
      )}
    </svg>
  );
};
