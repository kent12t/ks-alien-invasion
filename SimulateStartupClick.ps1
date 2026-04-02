# Simulates startup clicks so browser audio unlocks reliably in kiosk mode.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -MemberDefinition @'
[DllImport("user32.dll")]
public static extern bool SetForegroundWindow(IntPtr hWnd);

[DllImport("user32.dll")]
public static extern void mouse_event(int flags, int dx, int dy, int cButtons, int info);
'@ -Name U32 -Namespace Win32

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004

function Invoke-CenterClick {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $x = [int]($screen.Width / 2)
    $y = [int]($screen.Height / 2)

    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
    Start-Sleep -Milliseconds 100
    [Win32.U32]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    [Win32.U32]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
}

# Give Edge + app time to load, then perform multiple gestures for better reliability.
Start-Sleep -Seconds 7

$edge = Get-Process -Name msedge -ErrorAction SilentlyContinue |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

if ($edge -and $edge.MainWindowHandle -ne 0) {
    [Win32.U32]::SetForegroundWindow($edge.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 200
}

Invoke-CenterClick
Start-Sleep -Milliseconds 700
Invoke-CenterClick
