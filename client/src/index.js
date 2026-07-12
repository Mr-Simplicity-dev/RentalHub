import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

if (process.env.NODE_ENV === 'production') {
  const origError = console.error;
  console.error = (...args) => {
    if (args[0] instanceof Error || (typeof args[0] === 'string' && args[0].startsWith('[ReportOnly]'))) {
      origError(...args);
    }
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
