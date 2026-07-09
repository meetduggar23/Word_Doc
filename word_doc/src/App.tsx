import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from './components/Editor';
import LoadingScreen from './components/LoadingScreen';
import type { EditorHandle } from './types';
import { safeGetStorageItem, safeSetStorageItem } from './utils/storage';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAppReady, setIsAppReady] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setIsAppReady(true);
  }, []);

  const [docName, setDocName] = useState(() => {
    return safeGetStorageItem('worddoc-docname', 'Document1') || 'Document1';
  });

  const handleDocNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocName(e.target.value);
    safeSetStorageItem('worddoc-docname', e.target.value);
    editorRef.current?.markDirty();
  };

  const handleDocNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      setDocName('Document1');
      safeSetStorageItem('worddoc-docname', 'Document1');
    }
  };

  const handleDocNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleLogoClick = useCallback(() => {
    editorRef.current?.newDocument();
  }, []);

  return (
    <>
      {isLoading && (
        <LoadingScreen appReady={isAppReady} onComplete={handleLoadingComplete} />
      )}
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <div className="app-logo" onClick={handleLogoClick} title="New Document">
              <svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <path d="M 50 90 C 20 90, 10 60, 14 38 C 18 18, 32 8, 50 8 C 68 8, 82 18, 86 38 C 90 60, 80 90, 50 90 Z" fill="#2563eb"/>
                <path d="M 40 48 C 32 30, 20 28, 14 34 C 20 42, 32 52, 40 48 Z" fill="#FFFFFF"/>
                <path d="M 60 48 C 68 30, 80 28, 86 34 C 80 42, 68 52, 60 48 Z" fill="#FFFFFF"/>
              </svg>
              <span>Word Doc</span>
              <span className="app-version"><span style={{ color: 'var(--text-muted)' }}>LM </span><span className="app-version-italian">Technologies</span></span>
            </div>
            <div className="header-title-separator" />
            <input
              className="header-doc-title"
              type="text"
              value={docName}
              onChange={handleDocNameChange}
              onBlur={handleDocNameBlur}
              onKeyDown={handleDocNameKeyDown}
              spellCheck={false}
            />
            <div id="qat-portal" className="qat-title-bar" />
          </div>
          <div className="app-actions">
          </div>
        </header>
        <Editor ref={editorRef} docName={docName} setDocName={setDocName} />
      </div>
    </>
  );
};

export default App;
