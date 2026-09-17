# Read-only Windows process sampling for separate, opt-in performance diagnostics.
param(
    [ValidateRange(1,3600)][int]$Seconds = 600,
    [string]$Output = 'tests/artifacts/screens/ai574_baked_startup/host-telemetry.jsonl'
)
$ErrorActionPreference = 'Stop'
$stream = [IO.StreamWriter]::new((Join-Path (Get-Location) $Output), $true)
$stream.AutoFlush = $true
$previous = @{}
$previousTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
Write-Output 'Read-only process telemetry started.'
try {
    while ([DateTime]::UtcNow -lt $deadline) {
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $next = @{}
        $rows = @(Get-Process | ForEach-Object {
            $process = $_; $cpu = $process.CPU; $next[$process.Id] = $cpu
            $delta = $null
            if ($null -ne $cpu -and $previous.ContainsKey($process.Id) -and $null -ne $previous[$process.Id]) {
                $difference = $cpu - $previous[$process.Id]
                if ($difference -ge 0) { $delta = $difference }
            }
            if (($null -ne $delta -and $delta -ge 0.02) -or $process.ProcessName -match 'blender|chrome') {
                @{id=$process.Id; name=$process.ProcessName; cpuSeconds=$cpu;
                    deltaCpuSeconds=$delta; workingMiB=$process.WorkingSet64/1MB}
            }
        })
        $stream.WriteLine((@{timeMs=$now; intervalMs=$now-$previousTime; rows=$rows} | ConvertTo-Json -Depth 4 -Compress))
        $previous = $next; $previousTime = $now
        Start-Sleep -Seconds 1
    }
} finally { $stream.Dispose() }
