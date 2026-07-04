import React from 'react';

interface PageNavigatorProps {
  pages: { id: string; name: string; thumbnail: string }[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onDuplicatePage: (index: number) => void;
  onReorderPage: (fromIndex: number, toIndex: number) => void;
}

const PageNavigator: React.FC<PageNavigatorProps> = ({
  pages, activePageIndex, onSelectPage, onAddPage, onDeletePage, onDuplicatePage,
}) => {
  return (
    <div className="page-navigator">
      <div className="page-navigator-header">
        <span className="page-navigator-title">Pages</span>
        <button className="page-navigator-add-btn" onClick={onAddPage} title="Add Page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
      <div className="page-navigator-list">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={`page-navigator-item${index === activePageIndex ? ' active' : ''}`}
            onClick={() => onSelectPage(index)}
          >
            <div className="page-navigator-thumb">
              {page.thumbnail ? (
                <img src={page.thumbnail} alt={page.name} className="page-navigator-img" />
              ) : (
                <div className="page-navigator-placeholder">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                </div>
              )}
            </div>
            <div className="page-navigator-info">
              <span className="page-navigator-label">{page.name}</span>
            </div>
            <div className="page-navigator-actions">
              <button
                className="page-navigator-action-btn"
                onClick={e => { e.stopPropagation(); onDuplicatePage(index); }}
                title="Duplicate"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              {pages.length > 1 && (
                <button
                  className="page-navigator-action-btn danger"
                  onClick={e => { e.stopPropagation(); onDeletePage(index); }}
                  title="Delete"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="page-navigator-footer">
          <span className="page-navigator-count">{pages.length} pages</span>
        </div>
      )}
    </div>
  );
};

export default PageNavigator;
