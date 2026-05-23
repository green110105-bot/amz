Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
$procs = Get-Process chrome -ErrorAction SilentlyContinue
foreach ($p in $procs) {
    if ($p.MainWindowHandle -ne 0) {
        [W]::ShowWindow($p.MainWindowHandle, 3) | Out-Null  # 3 = SW_MAXIMIZE
        [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
        Write-Host ("maximized PID " + $p.Id + " title='" + $p.MainWindowTitle + "'")
    }
}
