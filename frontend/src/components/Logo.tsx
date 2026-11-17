import { Link } from 'react-router-dom';
import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ showText = true, className = '' }) => {
  return (
    <Link to="/" className={`flex items-center gap-2.5 group select-none ${className}`}>
      <div className="relative flex items-center justify-center">
        <img 
          src="/meridian-mark-transparent.png" 
          alt="Meridian" 
          className="h-8 sm:h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_0_12px_rgba(236,72,153,0.4)]" 
        />
      </div>
      {showText && (
        <span className="text-white text-xl sm:text-2xl font-extrabold tracking-tight group-hover:text-white/95 transition-colors">
          Meridian
        </span>
      )}
    </Link>
  );
};
