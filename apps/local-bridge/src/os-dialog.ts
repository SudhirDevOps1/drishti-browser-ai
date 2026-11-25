import { execFile } from 'node:child_process';
import path from 'node:path';

export interface SaveDialogOptions {
  filename?: string;
  folder?: string;
  timeoutMs?: number;
}

export interface SaveDialogResult {
  confirmed: boolean;
  processName?: string;
  windowTitle?: string;
  targetPath?: string;
  reason?: string;
}

const ALLOWED_BROWSER_PROCESSES = new Set(['chrome', 'brave', 'msedge']);

export function isAllowedBrowserProcess(name: string): boolean {
  return ALLOWED_BROWSER_PROCESSES.has(name.toLowerCase().replace(/\.exe$/i, ''));
}

export function buildSaveAsTargetPath(folder?: string, filename?: string): string | undefined {
  const cleanName = filename ? path.basename(filename).replace(/[<>:"/\\|?*]/g, '_') : '';
  if (folder && cleanName) return path.join(path.resolve(folder), cleanName);
  if (cleanName) return cleanName;
  return undefined;
}

/**
 * Safely confirms a native Windows `#32770` "Save As" dialog owned exclusively
 * by Chrome, Brave, or Edge without touching any other application windows.
 */
export async function confirmBrowserSaveDialog(options: SaveDialogOptions = {}): Promise<SaveDialogResult> {
  if (process.platform !== 'win32') {
    return { confirmed: false, reason: `OS Save As dialog automation is only supported on Windows (current: ${process.platform}).` };
  }

  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs ?? 8000), 1000), 30000);
  const targetPath = buildSaveAsTargetPath(options.folder, options.filename);
  const escapedTarget = targetPath ? targetPath.replace(/'/g, "''") : '';

  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$allowed = @('chrome', 'brave', 'msedge')
$deadline = (Get-Date).AddMilliseconds(${timeoutMs})
$root = [System.Windows.Automation.AutomationElement]::RootElement

while ((Get-Date) -lt $deadline) {
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
  $dialogs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
  foreach ($dlg in $dialogs) {
    try {
      $procId = $dlg.Current.ProcessId
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if (-not $proc -or ($allowed -notcontains $proc.ProcessName.ToLower())) { continue }

      $title = $dlg.Current.Name
      $targetVal = '${escapedTarget}'
      if ($targetVal -ne '') {
        $editCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
        $edit = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCond)
        if ($edit) {
          $vp = $null
          if ($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
            $vp.SetValue($targetVal)
          }
        }
      }

      $btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
      $buttons = $dlg.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
      foreach ($btn in $buttons) {
        $bName = ($btn.Current.Name -replace '&', '').Trim()
        if ($bName -eq 'Save') {
          $ip = $null
          if ($btn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$ip)) {
            $ip.Invoke()
            @{ confirmed = $true; processName = $proc.ProcessName; windowTitle = $title; targetPath = $targetVal } | ConvertTo-Json -Compress
            exit 0
          }
        }
      }
    } catch {}
  }
  Start-Sleep -Milliseconds 250
}

@{ confirmed = $false; reason = 'No browser Save As dialog found within timeout.' } | ConvertTo-Json -Compress
`;

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: timeoutMs + 5000 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve({ confirmed: false, reason: err.message });
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as SaveDialogResult;
          resolve(parsed);
        } catch {
          resolve({ confirmed: false, reason: stdout.trim() || 'Failed to parse dialog output' });
        }
      }
    );
  });
}
