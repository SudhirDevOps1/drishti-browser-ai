import { PageObservation } from './browser-controller.js';

interface RawDomSnapshot {
  url?: string;
  title?: string;
  bodyText?: string;
  elements?: Array<{
    selector?: string;
    tag?: string;
    type?: string;
    text?: string;
    visible?: boolean;
  }>;
  headings?: Array<{ level: string; text: string }>;
}

export class PageObserver {
  constructor(private bridge: { sendCommand: (action: string, payload: unknown) => Promise<unknown> }) {}

  async observe(tabId?: number): Promise<PageObservation> {
    const raw = (await this.bridge.sendCommand('GET_DOM_SNAPSHOT', { tabId })) as RawDomSnapshot;

    return {
      url: raw?.url || '',
      title: raw?.title || '',
      timestamp: Date.now(),
      textSummary: (raw?.bodyText || '').slice(0, 2000),
      interactiveElements: (raw?.elements || []).slice(0, 50).map((el, i) => ({
        index: i,
        type: el.tag || el.type || 'element',
        text: el.text?.slice(0, 100),
        selector: el.selector || '',
        visible: el.visible ?? true,
      })),
      headings: raw?.headings || [],
    };
  }
}
