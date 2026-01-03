import React from 'react';
import './PageHeader.css';

const PageHeader = ({ 
  title, 
  subtitle, 
  icon: Icon,
  children 
}) => {
  return (
    <header className="page-header">
      <div className="page-header-content">
        <div className="page-header-title-group">
          {Icon && <Icon className="page-header-icon" />}
          <div className="page-header-text">
            <h1 className="page-header-title">{title}</h1>
            {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="page-header-actions">{children}</div>}
      </div>
    </header>
  );
};

export default PageHeader;
