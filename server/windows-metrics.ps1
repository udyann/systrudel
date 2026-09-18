param([switch]$Once)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$previousNetwork = $null
$previousAt = $null
do {
  $sample = @{ gpu = $null; diskRead = $null; diskWrite = $null; diskIops = $null; networkRx = $null; networkTx = $null }
  try {
    $disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'" -OperationTimeoutSec 3
    if ($null -ne $disk) {
      $sample.diskRead = [double]$disk.DiskReadBytesPersec
      $sample.diskWrite = [double]$disk.DiskWriteBytesPersec
      $sample.diskIops = [double]$disk.DiskTransfersPersec
    }
  } catch {}
  try {
    $engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -OperationTimeoutSec 3)
    if ($engines.Count -gt 0) {
      $maximum = 0.0
      $groups = $engines | Group-Object { $_.Name -replace '^pid_\d+_', '' }
      foreach ($group in $groups) {
        $sum = ($group.Group | Measure-Object UtilizationPercentage -Sum).Sum
        $maximum = [Math]::Max($maximum, [double]$sum)
      }
      $sample.gpu = [Math]::Min(100.0, $maximum)
    }
  } catch {}
  try {
    $stats = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Get-NetAdapterStatistics)
    $at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $current = @{}
    foreach ($s in $stats) { $current[$s.Name] = @([double]$s.ReceivedBytes, [double]$s.SentBytes) }
    if ($null -ne $previousNetwork -and $at -gt $previousAt -and $stats.Count -gt 0) {
      $rx = 0.0; $tx = 0.0; $matched = 0
      foreach ($name in $current.Keys) {
        if ($previousNetwork.ContainsKey($name)) {
          $rx += [Math]::Max(0, $current[$name][0] - $previousNetwork[$name][0])
          $tx += [Math]::Max(0, $current[$name][1] - $previousNetwork[$name][1])
          $matched++
        }
      }
      if ($matched -gt 0) {
        $sample.networkRx = $rx * 1000 / ($at - $previousAt)
        $sample.networkTx = $tx * 1000 / ($at - $previousAt)
      }
    }
    $previousNetwork = $current; $previousAt = $at
  } catch {}
  $sample.ioSampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sample | ConvertTo-Json -Compress
  if (-not $Once) { Start-Sleep -Milliseconds 2000 }
} while (-not $Once)
