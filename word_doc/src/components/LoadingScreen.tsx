import React, { useEffect, useState, useRef } from 'react';

interface LoadingScreenProps {
  appReady: boolean;
  onComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ appReady, onComplete }) => {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');
  const [dots, setDots] = useState('');
  const startTimeRef = useRef(Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => setPhase('visible'));
  }, []);

  useEffect(() => {
    if (phase === 'exiting') return;
    if (reducedMotion) {
      setDots('...');
      return;
    }
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(interval);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== 'visible') return;
    if (!appReady) return;

    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, 2000 - elapsed);

    const timer = setTimeout(() => {
      setPhase('exiting');
    }, remaining);

    return () => clearTimeout(timer);
  }, [appReady, phase]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const timer = setTimeout(onComplete, 350);
    return () => clearTimeout(timer);
  }, [phase, onComplete]);

  return (
    <div className={`loading-screen ${phase === 'exiting' ? 'loading-screen--exiting' : ''}`}>
      <div className="loading-screen__content">
        <div className="loading-screen__logo">
          {reducedMotion ? (
            <div className="loading-screen__logo-static">
              <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M 50 90 C 20 90, 10 60, 14 38 C 18 18, 32 8, 50 8 C 68 8, 82 18, 86 38 C 90 60, 80 90, 50 90 Z" fill="#2563eb"/>
                <path d="M 40 48 C 32 30, 20 28, 14 34 C 20 42, 32 52, 40 48 Z" fill="#FFFFFF"/>
                <path d="M 60 48 C 68 30, 80 28, 86 34 C 80 42, 68 52, 60 48 Z" fill="#FFFFFF"/>
              </svg>
            </div>
          ) : (
            <div className="loading-screen__logo-enter">
              <div className="loading-screen__logo-float">
                <div className="loading-screen__logo-pulse">
                  <div className="loading-screen__logo-glow">
                    <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M 50 90 C 20 90, 10 60, 14 38 C 18 18, 32 8, 50 8 C 68 8, 82 18, 86 38 C 90 60, 80 90, 50 90 Z" fill="#2563eb"/>
                      <path d="M 40 48 C 32 30, 20 28, 14 34 C 20 42, 32 52, 40 48 Z" fill="#FFFFFF"/>
                      <path d="M 60 48 C 68 30, 80 28, 86 34 C 80 42, 68 52, 60 48 Z" fill="#FFFFFF"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <h1 className="loading-screen__title">Word Doc</h1>
        <p className="loading-screen__subtitle">
          Loading<span className="loading-screen__dots">{dots}</span>
        </p>
        <div className="loading-screen__progress">
          <div className="loading-screen__progress-bar" />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
