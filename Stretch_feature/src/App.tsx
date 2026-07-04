import React, { useState, useEffect } from 'react';
import Editor from './components/Editor';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('worddoc-theme') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('worddoc-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo">
            <svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path d="M 50 90 C 20 90, 10 60, 14 38 C 18 18, 32 8, 50 8 C 68 8, 82 18, 86 38 C 90 60, 80 90, 50 90 Z" fill="#2563eb"/>
              <path d="M 40 48 C 32 30, 20 28, 14 34 C 20 42, 32 52, 40 48 Z" fill="#FFFFFF"/>
              <path d="M 60 48 C 68 30, 80 28, 86 34 C 80 42, 68 52, 60 48 Z" fill="#FFFFFF"/>
            </svg>
            <span>Word Doc</span>
          </div>
          <div id="qat-portal" className="qat-title-bar" />
        </div>
        <div className="app-actions">
          <button
            className="theme-toggle-btn"
            onClick={() => setDarkMode(prev => !prev)}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
          <span className="app-version">MDX</span>
        </div>
      </header>
      <Editor />
    </div>
  );
};

export default App;
