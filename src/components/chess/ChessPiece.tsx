import React from 'react';

interface ChessPieceProps {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'P' | 'N' | 'B' | 'R' | 'Q' | 'K';
  className?: string;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({ type, className = 'w-full h-full' }) => {
  const isWhite = type === type.toUpperCase();
  const lower = type.toLowerCase();

  const whiteFill = '#ffffff';
  const whiteStroke = '#0f172a';
  const blackFill = '#18181b';
  const blackStroke = '#f8fafc';

  const fill = isWhite ? whiteFill : blackFill;
  const stroke = isWhite ? whiteStroke : blackStroke;

  switch (lower) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={className}>
          <path
            d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 1.47,-1.19 2.41,-3 2.41,-5.03 0,-2.41 -1.33,-4.5 -3.28,-5.62 c 0.49,-0.67 0.78,-1.49 0.78,-2.38 0,-2.21 -1.79,-4 -4,-4 z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'n':
      return (
        <svg viewBox="0 0 45 45" className={className}>
          <path
            d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          <path
            d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 14.5,7.5 C 14.5,7.5 16.5,8 17,7.5 C 17.5,7 16.5,6 16.5,6 C 16.5,6 18.5,6.5 19,6.5 C 19.5,6.5 20,5.5 20,5.5 C 20,5.5 20.67,7.098 21.5,7.5 C 22.33,7.902 23.5,7.5 23.5,7.5 C 23.5,7.5 23.46,9.213 22,10 z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          <circle cx="9.5" cy="25.5" r="1" fill={isWhite ? '#0f172a' : '#f8fafc'} />
          <path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" fill={isWhite ? '#0f172a' : '#f8fafc'} />
        </svg>
      );
    case 'b':
      return (
        <svg viewBox="0 0 45 45" className={className}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z" />
            <path d="M 12,36 C 12.27,34.13 13.06,32.48 14.5,31 C 17,28.5 17,25.5 16,21 C 15,16.5 18,10 22.5,10 C 27,10 30,16.5 29,21 C 28,25.5 28,28.5 30.5,31 C 31.94,32.48 32.73,34.13 33,36 C 29.84,35.84 25.68,36 22.5,34.5 C 19.32,36 15.16,35.84 12,36 z" />
            <circle cx="22.5" cy="8" r="1.5" />
          </g>
          <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
    case 'r':
      return (
        <svg viewBox="0 0 45 45" className={className}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
            <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
            <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" />
            <path d="M 34,14 L 31,17 L 14,17 L 11,14" />
            <path d="M 14,17 L 14,29.5 L 31,29.5 L 31,17" />
            <path d="M 14,29.5 L 11,32 L 34,32 L 31,29.5" />
          </g>
          <path d="M 12,36 L 33,36" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'q':
      return (
        <svg viewBox="0 0 45 45" className={className}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.5 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.5 L 14,25 L 6.5,13.5 z" />
            <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 12,35.5 16,35.5 18,36.5 C 19.5,37 21,37 22.5,37 C 24,37 25.5,37 27,36.5 C 29,35.5 33,35.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26" />
            <path d="M 11.5,30 C 15,29 30,29 33.5,30" />
            <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" />
            <circle cx="6" cy="12" r="1.5" />
            <circle cx="14" cy="9" r="1.5" />
            <circle cx="22.5" cy="8" r="1.5" />
            <circle cx="31" cy="9" r="1.5" />
            <circle cx="39" cy="12" r="1.5" />
          </g>
        </svg>
      );
    case 'k':
      return (
        <svg viewBox="0 0 45 45" className={className}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22.5,11.63 L 22.5,6" />
            <path d="M 20,8 L 25,8" />
            <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
            <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,35 37.5,30.5 36.5,27 C 35.5,23.5 33.5,21 31,19.5 C 29,18.5 25,18 22.5,18 C 20,18 16,18.5 14,19.5 C 11.5,21 9.5,23.5 8.5,27 C 7.5,30.5 8.5,35 11.5,37 z" />
            <path d="M 11.5,30 C 15,29 30,29 33.5,30" />
            <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" />
          </g>
        </svg>
      );
    default:
      return null;
  }
};
