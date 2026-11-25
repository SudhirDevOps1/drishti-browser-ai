export class ActionExecutor {
  constructor(private bridge: { sendCommand: (action: string, payload: unknown) => Promise<unknown> }) {}

  async click(selector: string, tabId?: number): Promise<void> {
    await this.bridge.sendCommand('CLICK', { selector, tabId });
  }

  async type(text: string, selector?: string, tabId?: number): Promise<void> {
    await this.bridge.sendCommand('TYPE', { text, selector, tabId });
  }

  async navigate(url: string, tabId?: number): Promise<void> {
    await this.bridge.sendCommand('NAVIGATE', { url, tabId, waitForLoad: true });
  }

  async scroll(direction: string, amount: number, tabId?: number): Promise<void> {
    await this.bridge.sendCommand('SCROLL', { direction, amount, tabId });
  }

  async pressKey(key: string, tabId?: number): Promise<void> {
    await this.bridge.sendCommand('PRESS_KEY', { key, tabId });
  }

  async screenshot(tabId?: number): Promise<string> {
    const result = (await this.bridge.sendCommand('SCREENSHOT', { tabId })) as { base64: string };
    return result.base64;
  }
}
