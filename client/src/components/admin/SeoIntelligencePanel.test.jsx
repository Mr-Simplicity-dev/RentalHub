import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
let root, container;
const render = async node => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(node));
};
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import SeoIntelligencePanel from './SeoIntelligencePanel';
import api from '../../services/api';
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      data: []
    }
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
});
test('missing Google configuration is shown honestly without exposing credentials', async () => {
  api.get.mockResolvedValue({
    data: {
      data: [{
        provider: 'search_console',
        status: 'disconnected',
        missing: ['GOOGLE_OAUTH_CLIENT_ID']
      }]
    }
  });
  await render(<SeoIntelligencePanel />);
  expect(await screen.findByText('Status: disconnected')).toBeInTheDocument();
  expect(screen.getByText(/Server setup needed:/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
test('empty Google performance does not invent traffic or a successful connection', async () => {
  api.get.mockImplementation(path => Promise.resolve({
    data: {
      data: path.includes('performance') ? {
        empty: true,
        summary: null,
        trend: [],
        topQueries: [],
        topPages: [],
        countries: [],
        devices: []
      } : []
    }
  }));
  await render(<SeoIntelligencePanel />);
  await act(async () => fireEvent.click(screen.getByRole('button', {
    name: 'Search performance',
    exact: true
  })));
  expect(await screen.findByText(/No imported performance data/)).toBeInTheDocument();
  expect(screen.queryByText('0 clicks')).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
test('Google refresh failure is visible and never claims a successful sync', async () => {
  api.post.mockRejectedValue({
    response: {
      data: {
        message: 'Connect Search Console first.'
      }
    }
  });
  await render(<SeoIntelligencePanel />);
  fireEvent.click(screen.getByRole('button', {
    name: 'Search performance',
    exact: true
  }));
  await waitFor(() => expect(api.get.mock.calls.map(([path])=>path)).toContain('/admin/seo/search-console/performance'));
  await act(async () => fireEvent.click(screen.getByRole('button', {
    name: 'Queue Google refresh'
  })));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connect Search Console first.');
  expect(screen.queryByText(/Google refresh: completed/)).toBeNull();
});
test('HTML audit accepts up to ten separate public URLs without changing inspection input',async()=>{api.post.mockResolvedValue({data:{data:{pages:[]}}});await render(<SeoIntelligencePanel/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Technical checks',exact:true})));const batch=screen.getByRole('textbox',{name:/Optional HTML audit batch/});await act(async()=>fireEvent.change(batch,{target:{value:'https://rentalhub.com.ng/properties/1\nhttps://rentalhub.com.ng/nigeria/lagos'}}));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Audit returned HTML'})));expect(api.post).toHaveBeenCalledWith('/admin/seo/technical-audit',{urls:['https://rentalhub.com.ng/properties/1','https://rentalhub.com.ng/nigeria/lagos']});});
