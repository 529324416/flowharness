param(
    [string]$Out = "",
    [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Out)) {
    $Out = Join-Path $root "devlog\assets\ui-current.png"
} else {
    $Out = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))
}

$electron = Join-Path $root "apps\desktop\node_modules\electron\dist\electron.exe"
$appDir = Join-Path $root "apps\desktop"

if (-not (Test-Path $electron)) {
    throw "Electron binary not found: $electron (run 'pnpm ensure:electron')"
}
if (-not (Test-Path (Join-Path $appDir "out\renderer\index.html"))) {
    throw "Renderer build not found; run 'pnpm build' first."
}

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FhWindowCapture {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
}
"@

$logOut = Join-Path $env:TEMP ("fh-capture-" + [guid]::NewGuid().ToString("N") + ".out.txt")
$logErr = Join-Path $env:TEMP ("fh-capture-" + [guid]::NewGuid().ToString("N") + ".err.txt")
$proc = $null

try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

    $proc = Start-Process -FilePath $electron `
        -ArgumentList "--no-sandbox", "--disable-gpu", $appDir `
        -PassThru `
        -RedirectStandardOutput $logOut `
        -RedirectStandardError $logErr

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    $window = $null
    while ((Get-Date) -lt $deadline -and -not $window) {
        Start-Sleep -Milliseconds 500
        $window = Get-Process -Name electron -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq "FlowHarness" } |
            Select-Object -First 1
    }

    if (-not $window) {
        throw "FlowHarness window did not appear within ${TimeoutSeconds}s (see $logErr)."
    }

    # In restricted environments the renderer can take several seconds to mount.
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $logOut) {
            if (Select-String -Path $logOut -Pattern 'phase":"data"' -Quiet) { break }
        }
    }

    Start-Sleep -Milliseconds 1000

    $hwnd = $window.MainWindowHandle
    $rect = New-Object FhWindowCapture+RECT
    [FhWindowCapture]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -le 0 -or $height -le 0) {
        throw "Invalid window rect: ${width}x${height}."
    }

    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    $ok = [FhWindowCapture]::PrintWindow($hwnd, $hdc, 2)
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()

    if (-not $ok) {
        $bitmap.Dispose()
        throw "PrintWindow failed; the window may not render to a bitmap in this session."
    }

    $directory = Split-Path -Parent $Out
    if ($directory -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()

    Write-Host "captured ${width}x${height}: $Out"
    Write-Host "app log: $logOut"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
    }
}
