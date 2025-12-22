import { useEffect, useRef } from 'react';

interface MetaElement {
  tag: string;
  attributes: Record<string, string>;
  content?: string;
}

export function useMetaSync() {
  const syncedElementsRef = useRef<Set<Element>>(new Set());
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const iframe = document.getElementById(
      'user-app-iframe',
    ) as HTMLIFrameElement;
    if (!iframe) return;

    const syncMetaElements = () => {
      try {
        const iframeWindow = iframe.contentWindow;
        const iframeDocument = iframe.contentDocument;
        if (!iframeWindow || !iframeDocument) return;

        // Get all relevant meta elements from iframe
        const metaElements: MetaElement[] = [];

        // Get title
        const iframeTitle = iframeDocument.title;
        if (iframeTitle) {
          document.title = iframeTitle;
        }

        // Get favicon
        const faviconLinks = iframeDocument.querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
        );
        faviconLinks.forEach((link) => {
          const linkEl = link as HTMLLinkElement;
          metaElements.push({
            tag: 'link',
            attributes: {
              rel: linkEl.rel,
              href: linkEl.href,
              type: linkEl.type || '',
              sizes: linkEl.sizes?.toString() || '',
            },
          });
        });

        // Get Open Graph tags
        const ogTags = iframeDocument.querySelectorAll(
          'meta[property^="og:"], meta[property^="article:"], meta[property^="book:"], meta[property^="profile:"], meta[property^="video:"], meta[property^="music:"]',
        );
        ogTags.forEach((meta) => {
          const metaEl = meta as HTMLMetaElement;
          metaElements.push({
            tag: 'meta',
            attributes: {
              property: metaEl.getAttribute('property') || '',
              content: metaEl.content,
            },
          });
        });

        // Get Twitter Card tags
        const twitterTags = iframeDocument.querySelectorAll(
          'meta[name^="twitter:"]',
        );
        twitterTags.forEach((meta) => {
          const metaEl = meta as HTMLMetaElement;
          metaElements.push({
            tag: 'meta',
            attributes: {
              name: metaEl.name,
              content: metaEl.content,
            },
          });
        });

        // Get other important meta tags
        const importantMetaTags = iframeDocument.querySelectorAll(
          'meta[name="description"], meta[name="keywords"], meta[name="author"]',
        );
        importantMetaTags.forEach((meta) => {
          const metaEl = meta as HTMLMetaElement;
          const attributes: Record<string, string> = {};

          if (metaEl.name) attributes.name = metaEl.name;
          if (metaEl.content) attributes.content = metaEl.content;

          metaElements.push({
            tag: 'meta',
            attributes,
          });
        });

        // Get canonical link
        const canonicalLink = iframeDocument.querySelector(
          'link[rel="canonical"]',
        );
        if (canonicalLink) {
          const linkEl = canonicalLink as HTMLLinkElement;
          metaElements.push({
            tag: 'link',
            attributes: {
              rel: 'canonical',
              href: linkEl.href,
            },
          });
        }

        // Clear previously synced elements now that new metaElements is computed
        syncedElementsRef.current.forEach((element) => {
          element.remove();
        });
        syncedElementsRef.current.clear();

        // Apply meta elements to parent document
        const fragment = document.createDocumentFragment();
        metaElements.forEach((metaInfo) => {
          // Remove existing similar elements first
          if (metaInfo.tag === 'meta') {
            if (metaInfo.attributes.property) {
              const existing = document.querySelectorAll(
                `meta[property="${metaInfo.attributes.property}"]`,
              );
              existing.forEach((el) => {
                if (!syncedElementsRef.current.has(el)) {
                  el.remove();
                }
              });
            } else if (metaInfo.attributes.name) {
              const existing = document.querySelectorAll(
                `meta[name="${metaInfo.attributes.name}"]`,
              );
              existing.forEach((el) => {
                if (!syncedElementsRef.current.has(el)) {
                  el.remove();
                }
              });
            }
          } else if (metaInfo.tag === 'link') {
            if (metaInfo.attributes.rel?.includes('icon')) {
              const existing = document.querySelectorAll('link[rel*="icon"]');
              existing.forEach((el) => {
                if (!syncedElementsRef.current.has(el)) {
                  el.remove();
                }
              });
            } else if (metaInfo.attributes.rel === 'canonical') {
              const existing = document.querySelector('link[rel="canonical"]');
              if (existing && !syncedElementsRef.current.has(existing)) {
                existing.remove();
              }
            }
          }

          // Create and append new element
          const element = document.createElement(metaInfo.tag);
          Object.entries(metaInfo.attributes).forEach(([key, value]) => {
            if (value) {
              element.setAttribute(key, value);
            }
          });

          fragment.appendChild(element);
          syncedElementsRef.current.add(element);
        });
        document.head.appendChild(fragment);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'SecurityError') {
          console.debug('Cannot access cross-origin iframe head');
        } else {
          console.error('Failed to sync meta tags:', e);
        }
      }
    };

    const setupObserver = () => {
      try {
        const iframeDocument = iframe.contentDocument;
        if (!iframeDocument) return;

        // Disconnect existing observer
        if (observerRef.current) {
          observerRef.current.disconnect();
        }

        // Create new observer
        observerRef.current = new MutationObserver((mutations) => {
          // Check if any mutations affect head elements
          const hasHeadChanges = mutations.some((mutation) => {
            if (mutation.target === iframeDocument.head) return true;
            if (mutation.target.nodeName === 'TITLE') return true;
            if (mutation.target.nodeName === 'META') return true;
            if (mutation.target.nodeName === 'LINK') return true;

            // Check for text content changes in TITLE elements
            if (mutation.type === 'characterData') {
              const parentNode = mutation.target.parentNode;
              if (parentNode && parentNode.nodeName === 'TITLE') {
                return true;
              }
            }

            // Check added/removed nodes
            for (const node of Array.from(mutation.addedNodes)) {
              if (
                node.nodeName === 'META' ||
                node.nodeName === 'LINK' ||
                node.nodeName === 'TITLE'
              ) {
                return true;
              }
            }
            for (const node of Array.from(mutation.removedNodes)) {
              if (
                node.nodeName === 'META' ||
                node.nodeName === 'LINK' ||
                node.nodeName === 'TITLE'
              ) {
                return true;
              }
            }

            return false;
          });

          if (hasHeadChanges) {
            syncMetaElements();
          }
        });

        // Observe head element and title changes
        if (iframeDocument.head) {
          observerRef.current.observe(iframeDocument.head, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
              'content',
              'href',
              'property',
              'name',
              'rel',
              'sizes',
              'type',
            ],
            characterData: true,
          });
        }

        // Also observe the document element for title changes
        observerRef.current.observe(iframeDocument.documentElement, {
          childList: true,
          subtree: false,
        });

        // Initial sync
        syncMetaElements();
      } catch (e) {
        console.debug('Failed to setup meta observer:', e);
      }
    };

    // Setup observer when iframe loads
    const handleIframeLoad = () => {
      setupObserver();
    };

    try {
      iframe.addEventListener('load', handleIframeLoad);
    } catch {
      // ignore
    }

    // Try to setup immediately if iframe is already loaded
    if (iframe.contentDocument?.readyState === 'complete') {
      setupObserver();
    }

    return () => {
      try {
        iframe.removeEventListener('load', handleIframeLoad);
      } catch {
        // ignore
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      // Clean up synced elements on unmount
      syncedElementsRef.current.forEach((element) => {
        element.remove();
      });
      syncedElementsRef.current.clear();
    };
  }, []);
}
