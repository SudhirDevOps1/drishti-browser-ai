export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
}

export interface LinkInfo {
  text: string;
  href: string;
  type: string;
}

export interface ElementSummary {
  index: number;
  type: string;
  text?: string;
  selector: string;
  visible: boolean;
}

export interface PageObservation {
  url: string;
  title: string;
  timestamp: number;
  textSummary: string;
  interactiveElements: ElementSummary[];
  headings: { level: string; text: string }[];
}

export interface BrowserController {
  observe(tabId?: number): Promise<PageObservation>;
  screenshot(tabId?: number): Promise<string>;
  navigate(url: string, tabId?: number): Promise<void>;
  back(tabId?: number): Promise<void>;
  forward(tabId?: number): Promise<void>;
  reload(tabId?: number): Promise<void>;
  listTabs(): Promise<TabInfo[]>;
  newTab(url?: string): Promise<TabInfo>;
  switchTab(tabId: number): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  click(selector: string, tabId?: number): Promise<void>;
  type(text: string, selector?: string, tabId?: number): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number, tabId?: number): Promise<void>;
  pressKey(key: string, tabId?: number): Promise<void>;
  getText(selector?: string, tabId?: number): Promise<string>;
  getLinks(tabId?: number): Promise<LinkInfo[]>;
}
