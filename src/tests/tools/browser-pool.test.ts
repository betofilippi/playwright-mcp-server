import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BrowserPool } from '../../tools/browser-pool.js';
import { SessionManager } from '../../services/session.js';
import { Browser, BrowserContext, Page } from 'playwright';

/**
 * Unit tests for BrowserPool class
 * Tests browser instance management, connection pooling, and resource cleanup
 */

describe('BrowserPool', () => {
  let browserPool: BrowserPool;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockBrowser: jest.Mocked<Browser>;
  let mockContext: jest.Mocked<BrowserContext>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    // Mock SessionManager
    mockSessionManager = {
      createBrowser: jest.fn(),
      getBrowserSession: jest.fn(),
      createContext: jest.fn(),
      getContextSession: jest.fn(),
      createPageSession: jest.fn(),
      closeBrowserSession: jest.fn(),
      listBrowserSessions: jest.fn(),
      listContextSessions: jest.fn(),
      listPageSessions: jest.fn(),
      shutdown: jest.fn(),
    } as any;

    // Mock Browser
    mockBrowser = {
      isConnected: jest.fn().mockReturnValue(true),
      version: jest.fn().mockReturnValue('1.0.0'),
      newContext: jest.fn(),
      close: jest.fn(),
    } as any;

    // Mock BrowserContext
    mockContext = {
      newPage: jest.fn(),
      close: jest.fn(),
      pages: jest.fn().mockReturnValue([]),
    } as any;

    // Mock Page
    mockPage = {
      url: jest.fn().mockReturnValue('about:blank'),
      title: jest.fn().mockReturnValue('Test Page'),
      close: jest.fn(),
    } as any;

    browserPool = new BrowserPool(mockSessionManager);
  });

  afterEach(async () => {
    await browserPool.cleanup();
  });

  describe('getBrowser', () => {
    test('should create new browser when none exists', async () => {
      const browserId = 'browser-123';
      const browserSession = {
        id: browserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      };

      mockSessionManager.createBrowser.mockResolvedValue({ browserId });
      mockSessionManager.getBrowserSession.mockReturnValue(browserSession);
      mockSessionManager.listBrowserSessions.mockReturnValue([]);

      const result = await browserPool.getBrowser('chromium');

      expect(result.browserId).toBe(browserId);
      expect(result.browser).toBe(mockBrowser);
      expect(mockSessionManager.createBrowser).toHaveBeenCalledWith('chromium', undefined);
    });

    test('should reuse existing healthy browser', async () => {
      const existingBrowserId = 'browser-existing';
      const existingSession = {
        id: existingBrowserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      };

      mockSessionManager.listBrowserSessions.mockReturnValue([existingSession]);
      mockBrowser.isConnected.mockReturnValue(true);

      const result = await browserPool.getBrowser('chromium');

      expect(result.browserId).toBe(existingBrowserId);
      expect(result.browser).toBe(mockBrowser);
      expect(mockSessionManager.createBrowser).not.toHaveBeenCalled();
    });

    test('should create new browser if existing browser is disconnected', async () => {
      const disconnectedBrowserId = 'browser-disconnected';
      const disconnectedSession = {
        id: disconnectedBrowserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      };

      const newBrowserId = 'browser-new';
      const newSession = {
        id: newBrowserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      };

      mockSessionManager.listBrowserSessions
        .mockReturnValueOnce([disconnectedSession])
        .mockReturnValueOnce([]);
      mockBrowser.isConnected
        .mockReturnValueOnce(false) // For existing browser
        .mockReturnValue(true); // For new browser
      mockSessionManager.createBrowser.mockResolvedValue({ browserId: newBrowserId });
      mockSessionManager.getBrowserSession.mockReturnValue(newSession);

      const result = await browserPool.getBrowser('chromium');

      expect(result.browserId).toBe(newBrowserId);
      expect(mockSessionManager.createBrowser).toHaveBeenCalled();
    });
  });

  describe('getContext', () => {
    test('should create new context when none exists', async () => {
      const browserId = 'browser-123';
      const contextId = 'context-456';
      const contextSession = {
        id: contextId,
        context: mockContext,
        browserId,
        pages: new Map(),
        createdAt: new Date(),
      };

      mockSessionManager.getBrowserSession.mockReturnValue({
        id: browserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      });
      mockSessionManager.listContextSessions.mockReturnValue([]);
      mockSessionManager.createContext.mockResolvedValue(contextId);
      mockSessionManager.getContextSession.mockReturnValue(contextSession);

      const result = await browserPool.getContext(browserId, {
        viewport: { width: 1280, height: 720 }
      });

      expect(result.contextId).toBe(contextId);
      expect(result.context).toBe(mockContext);
      expect(mockSessionManager.createContext).toHaveBeenCalledWith(
        browserId,
        { viewport: { width: 1280, height: 720 } }
      );
    });

    test('should handle context creation errors', async () => {
      const browserId = 'browser-123';

      mockSessionManager.getBrowserSession.mockReturnValue({
        id: browserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      });
      mockSessionManager.createContext.mockRejectedValue(new Error('Context creation failed'));

      await expect(browserPool.getContext(browserId)).rejects.toThrow('Failed to get context from pool');
    });
  });

  describe('getPage', () => {
    test('should create new page when none exists', async () => {
      const contextId = 'context-456';
      const pageId = 'page-789';
      const pageSession = {
        id: pageId,
        page: mockPage,
        contextId,
        url: 'about:blank',
        title: 'Test Page',
        createdAt: new Date(),
      };

      mockContext.newPage.mockResolvedValue(mockPage);
      mockSessionManager.getContextSession.mockReturnValue({
        id: contextId,
        context: mockContext,
        browserId: 'browser-123',
        pages: new Map(),
        createdAt: new Date(),
      });
      mockSessionManager.listPageSessions.mockReturnValue([]);
      mockSessionManager.createPageSession.mockResolvedValue(pageId);

      const result = await browserPool.getPage(contextId);

      expect(result.pageId).toBe(pageId);
      expect(result.page).toBe(mockPage);
      expect(mockContext.newPage).toHaveBeenCalled();
    });

    test('should reuse existing page when available', async () => {
      const contextId = 'context-456';
      const existingPageId = 'page-existing';
      const existingPageSession = {
        id: existingPageId,
        page: mockPage,
        contextId,
        url: 'about:blank',
        title: 'Test Page',
        createdAt: new Date(),
      };

      mockSessionManager.getContextSession.mockReturnValue({
        id: contextId,
        context: mockContext,
        browserId: 'browser-123',
        pages: new Map(),
        createdAt: new Date(),
      });
      mockSessionManager.listPageSessions.mockReturnValue([existingPageSession]);

      const result = await browserPool.getPage(contextId);

      expect(result.pageId).toBe(existingPageId);
      expect(result.page).toBe(mockPage);
      expect(mockContext.newPage).not.toHaveBeenCalled();
    });
  });

  describe('isBrowserConnected', () => {
    test('should return true for connected browser', async () => {
      const browserId = 'browser-123';
      const browserSession = {
        id: browserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      };

      mockSessionManager.getBrowserSession.mockReturnValue(browserSession);
      mockBrowser.isConnected.mockReturnValue(true);

      const result = await browserPool.isBrowserConnected(browserId);

      expect(result).toBe(true);
      expect(mockBrowser.isConnected).toHaveBeenCalled();
    });

    test('should return false for disconnected browser', async () => {
      const browserId = 'browser-123';
      const browserSession = {
        id: browserId,
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map(),
        createdAt: new Date(),
      };

      mockSessionManager.getBrowserSession.mockReturnValue(browserSession);
      mockBrowser.isConnected.mockReturnValue(false);

      const result = await browserPool.isBrowserConnected(browserId);

      expect(result).toBe(false);
    });

    test('should return false for non-existent browser', async () => {
      const browserId = 'browser-nonexistent';

      mockSessionManager.getBrowserSession.mockImplementation(() => {
        throw new Error('Browser not found');
      });

      const result = await browserPool.isBrowserConnected(browserId);

      expect(result).toBe(false);
    });
  });

  describe('getBrowsersWithStatus', () => {
    test('should return browser status information', () => {
      const browserSession = {
        id: 'browser-123',
        browser: mockBrowser,
        browserType: 'chromium',
        contexts: new Map([
          ['context-1', { pages: new Map([['page-1', {}], ['page-2', {}]]) }],
          ['context-2', { pages: new Map([['page-3', {}]]) }],
        ]),
        createdAt: new Date('2023-01-01T00:00:00Z'),
      };

      mockSessionManager.listBrowserSessions.mockReturnValue([browserSession]);
      mockBrowser.version.mockReturnValue('1.2.3');
      mockBrowser.isConnected.mockReturnValue(true);

      const result = browserPool.getBrowsersWithStatus();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'browser-123',
        type: 'chromium',
        version: '1.2.3',
        connected: true,
        contexts: 2,
        pages: 3,
        createdAt: '2023-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getPoolStats', () => {
    test('should return comprehensive pool statistics', () => {
      const browserSessions = [
        {
          id: 'browser-1',
          browser: { ...mockBrowser, isConnected: () => true },
          browserType: 'chromium',
          contexts: new Map([['context-1', {}], ['context-2', {}]]),
          createdAt: new Date(),
        },
        {
          id: 'browser-2',
          browser: { ...mockBrowser, isConnected: () => false },
          browserType: 'firefox',
          contexts: new Map([['context-3', {}]]),
          createdAt: new Date(),
        },
      ];

      const contextSessions = [
        {
          id: 'context-1',
          context: mockContext,
          browserId: 'browser-1',
          pages: new Map([['page-1', {}], ['page-2', {}]]),
          createdAt: new Date(),
        },
        {
          id: 'context-2',
          context: mockContext,
          browserId: 'browser-1',
          pages: new Map(),
          createdAt: new Date(),
        },
        {
          id: 'context-3',
          context: mockContext,
          browserId: 'browser-2',
          pages: new Map([['page-3', {}]]),
          createdAt: new Date(),
        },
      ];

      const pageSessions = [
        { id: 'page-1' },
        { id: 'page-2' },
        { id: 'page-3' },
      ];

      mockSessionManager.listBrowserSessions.mockReturnValue(browserSessions);
      mockSessionManager.listContextSessions
        .mockReturnValueOnce([contextSessions[0], contextSessions[1]]) // browser-1
        .mockReturnValueOnce([contextSessions[2]]); // browser-2
      mockSessionManager.listPageSessions
        .mockReturnValueOnce([pageSessions[0], pageSessions[1]]) // context-1
        .mockReturnValueOnce([]) // context-2
        .mockReturnValueOnce([pageSessions[2]]); // context-3

      const result = browserPool.getPoolStats();

      expect(result.browsers.total).toBe(2);
      expect(result.browsers.byType).toEqual({ chromium: 1, firefox: 1 });
      expect(result.browsers.connected).toBe(1);
      expect(result.browsers.disconnected).toBe(1);
      expect(result.contexts.total).toBe(3);
      expect(result.contexts.active).toBe(2); // contexts with pages
      expect(result.pages.total).toBe(3);
      expect(result.memory).toBeDefined();
    });
  });

  describe('cleanup', () => {
    test('should cleanup all resources', async () => {
      await browserPool.cleanup();

      expect(mockSessionManager.shutdown).toHaveBeenCalled();
    });
  });
});