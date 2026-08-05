# Windows local machine: register a scheduled task running --fast every 2 minutes
# Run as Administrator: powershell -ExecutionPolicy Bypass -File deploy\install-windows.ps1
$ErrorActionPreference = 'Stop'
$node = (Get-Command node).Source
$dir = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\fetch_resources.js`" --fast" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName 'AniFastCrawl' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host 'Registered scheduled task AniFastCrawl (every 2 min)'
Write-Host ("Uninstall: Unregister-ScheduledTask -TaskName AniFastCrawl -Confirm:" + '$false')