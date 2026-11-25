#!/usr/bin/env python3
"""
Drishti Browser AI — Scoped Windows Save As Dialog Auto-Confirmer.
Uses pure Win32 ctypes (zero external pip dependencies) to find a `#32770`
"Save As" dialog owned exclusively by Chrome, Brave, or Edge and click "Save".
"""

import argparse
import ctypes
from ctypes import wintypes
import json
import sys
import time

if sys.platform != "win32":
    print(json.dumps({"confirmed": False, "reason": f"Unsupported OS: {sys.platform}"}))
    sys.exit(0)

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

BM_CLICK = 0x00F5
WM_SETTEXT = 0x000C
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
ALLOWED_PROCS = {"chrome.exe", "brave.exe", "msedge.exe"}

WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def get_window_text(hwnd: int) -> str:
    length = user32.GetWindowTextLengthW(hwnd)
    if length <= 0:
        return ""
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    return buf.value


def get_class_name(hwnd: int) -> str:
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def get_process_name(pid: int) -> str:
    hproc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not hproc:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(260)
        size = wintypes.DWORD(260)
        if kernel32.QueryFullProcessImageNameW(hproc, 0, buf, ctypes.byref(size)):
            return buf.value.rsplit("\\", 1)[-1].lower()
        return ""
    finally:
        kernel32.CloseHandle(hproc)


def find_and_confirm_save_dialog(target_path: str = "", timeout_ms: int = 8000) -> dict:
    deadline = time.monotonic() + (max(1000, min(timeout_ms, 30000)) / 1000.0)

    while time.monotonic() < deadline:
        matched = []

        def enum_top(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            if get_class_name(hwnd) != "#32770":
                return True
            pid = wintypes.DWORD(0)
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            proc_name = get_process_name(pid.value)
            if proc_name in ALLOWED_PROCS:
                matched.append((hwnd, proc_name, get_window_text(hwnd)))
            return True

        user32.EnumWindows(WNDENUMPROC(enum_top), 0)

        for dlg_hwnd, proc_name, title in matched:
            save_btn = None
            edit_hwnd = None

            def enum_child(child_hwnd, _lparam):
                nonlocal save_btn, edit_hwnd
                cls = get_class_name(child_hwnd)
                txt = get_window_text(child_hwnd).replace("&", "").strip()
                if cls == "Button" and txt.lower() == "save":
                    save_btn = child_hwnd
                elif cls == "Edit" and edit_hwnd is None:
                    edit_hwnd = child_hwnd
                return True

            user32.EnumChildWindows(dlg_hwnd, WNDENUMPROC(enum_child), 0)

            if save_btn:
                if target_path and edit_hwnd:
                    user32.SendMessageW(edit_hwnd, WM_SETTEXT, 0, target_path)
                user32.SendMessageW(save_btn, BM_CLICK, 0, 0)
                return {
                    "confirmed": True,
                    "processName": proc_name,
                    "windowTitle": title,
                    "targetPath": target_path,
                    "engine": "python-win32",
                }

        time.sleep(0.2)

    return {"confirmed": False, "reason": "No browser Save As dialog found within timeout.", "engine": "python-win32"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="", help="Optional target path/filename")
    parser.add_argument("--timeout", type=int, default=8000, help="Timeout in ms")
    args = parser.parse_args()
    res = find_and_confirm_save_dialog(args.target, args.timeout)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
