import React, { useState, useEffect, useCallback, useRef, Component } from 'react';
import Editor from './components/Editor';
import LoadingScreen from './components/LoadingScreen';
import type { EditorHandle } from './types';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', background: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#666', fontSize: 14, maxWidth: 500, textAlign: 'center', marginBottom: 16 }}>{this.state.error?.message}</p>
          <pre style={{ background: '#f8f9fb', padding: 12, borderRadius: 6, fontSize: 12, maxWidth: '80%', overflow: 'auto', color: '#666' }}>{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '8px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  const [docName, setDocName] = useState('Document1');

  const handleDocNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocName(e.target.value);
    editorRef.current?.markDirty();
  };

  const handleDocNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      setDocName('Document1');
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
        <ErrorBoundary>
          <Editor ref={editorRef} docName={docName} setDocName={setDocName} />
        </ErrorBoundary>
      </div>
    </>
  );
};

export default App;
