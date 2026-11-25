export interface ToolDefinition {
  name: string;
  category: 'BROWSER' | 'NAVIGATION' | 'TABS' | 'INTERACTION' | 'CONTENT' | 'AUTOMATION' | 'DEBUGGING';
  description: string;
  inputSchema: Record<string, unknown>;
}

export const ALL_MCP_TOOL_NAMES = [
  'browser_status',
  'browser_observe',
  'browser_snapshot',
  'browser_screenshot',
  'browser_inspect',
  'browser_get_page_info',
  'browser_navigate',
  'browser_back',
  'browser_forward',
  'browser_reload',
  'browser_wait',
  'browser_list_tabs',
  'browser_new_tab',
  'browser_switch_tab',
  'browser_close_tab',
  'browser_group_tabs',
  'browser_click',
  'browser_double_click',
  'browser_hover',
  'browser_type',
  'browser_fill',
  'browser_press_key',
  'browser_scroll',
  'browser_select',
  'browser_get_text',
  'browser_get_links',
  'browser_find_element',
  'browser_get_tables',
  'browser_get_forms',
  'browser_execute_workflow',
  'browser_verify_action',
  'browser_task_status',
  'browser_stop_task',
  'browser_console',
  'browser_get_errors',
  'browser_network_inspect',
  'browser_bridge_health',
] as const;

export type MCPToolName = typeof ALL_MCP_TOOL_NAMES[number];
