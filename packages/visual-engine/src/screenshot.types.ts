export interface ScreenshotMetadata {
  tabId: number;
  url: string;
  timestamp: number;
  format: 'png' | 'jpeg';
  base64: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface VisualElement {
  x: number;
  y: number;
  width: number;
  height: number;
  description: string;
}
