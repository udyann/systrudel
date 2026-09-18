param([switch]$Check, [switch]$Once)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class ActivityCounters {
  public delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public Point point; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Key { public uint code, scan, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr hwnd; public uint message; public UIntPtr wparam; public IntPtr lparam; public uint time; public Point point; public uint privateData; }
  [StructLayout(LayoutKind.Sequential)] struct LastInput { public uint size, time; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out Message msg, IntPtr hwnd, uint min, uint max, uint remove);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message msg);
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LastInput info);
  static long keys, clicks, wheel;
  static readonly Hook keyboard = OnKey, mouse = OnMouse;
  static IntPtr keyHook, mouseHook;
  static IntPtr OnKey(int code, IntPtr message, IntPtr data) {
    if (code >= 0 && (message.ToInt64() == 0x100 || message.ToInt64() == 0x104)) {
      Key k = (Key)Marshal.PtrToStructure(data, typeof(Key));
      if ((k.flags & 0x10) == 0 && k.code != 16 && k.code != 17 && k.code != 18 && !(k.code >= 160 && k.code <= 165) && k.code != 91 && k.code != 92) Interlocked.Increment(ref keys);
    }
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  static IntPtr OnMouse(int code, IntPtr message, IntPtr data) {
    if (code >= 0) {
      Mouse m = (Mouse)Marshal.PtrToStructure(data, typeof(Mouse));
      if ((m.flags & 1) == 0) {
        long kind = message.ToInt64();
        if (kind == 0x201 || kind == 0x204 || kind == 0x207 || kind == 0x20B) Interlocked.Increment(ref clicks);
        if (kind == 0x20A || kind == 0x20E) Interlocked.Add(ref wheel, Math.Abs((int)(short)(m.data >> 16)));
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  public static void Start() {
    keyHook = SetWindowsHookEx(13, keyboard, GetModuleHandle(null), 0);
    mouseHook = SetWindowsHookEx(14, mouse, GetModuleHandle(null), 0);
    if (keyHook == IntPtr.Zero || mouseHook == IntPtr.Zero) { Stop(); throw new Exception("Windows activity hooks unavailable"); }
  }
  public static void Pump() { Message m; while (PeekMessage(out m, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref m); DispatchMessage(ref m); } }
  public static double[] Take() {
    LastInput last = new LastInput(); last.size = (uint)Marshal.SizeOf(typeof(LastInput));
    double idle = GetLastInputInfo(ref last) ? unchecked((uint)Environment.TickCount - last.time) / 1000.0 : -1;
    return new double[] { Interlocked.Exchange(ref keys, 0), Interlocked.Exchange(ref clicks, 0), Interlocked.Exchange(ref wheel, 0) / 120.0, idle };
  }
  public static void Stop() { if (keyHook != IntPtr.Zero) UnhookWindowsHookEx(keyHook); if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook); }
}
'@
if ($Check) { Write-Output 'Activity collector compiled'; exit }
try {
  [ActivityCounters]::Start()
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $previous = 0
  while ($true) {
    [ActivityCounters]::Pump()
    $now = $watch.ElapsedMilliseconds
    if ($now - $previous -ge 250) {
      $counts = [ActivityCounters]::Take()
      $elapsed = ($now - $previous) / 1000.0
      @{ sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); scope = 'windows'; keysPerSecond = $counts[0] / $elapsed; clicksPerSecond = $counts[1] / $elapsed; scrollPerSecond = $counts[2] / $elapsed; idleSeconds = $counts[3] } | ConvertTo-Json -Compress
      $previous = $now
      if ($Once) { break }
    }
    Start-Sleep -Milliseconds 10
  }
} finally { [ActivityCounters]::Stop() }
