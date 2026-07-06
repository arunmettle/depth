param(
  [string]$ReportDirectory = "artifacts"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $ReportDirectory "goal-9-validation-$timestamp.json"

if (-not $env:VALIDATION_REPORT_PATH) {
  $env:VALIDATION_REPORT_PATH = $reportPath
}

Write-Output "Goal 9 validation report will be written to $($env:VALIDATION_REPORT_PATH)"

node scripts/validate-goal-9.mjs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output ""
Write-Output "Goal 9 validation completed successfully."
Write-Output "JSON report artifact: $($env:VALIDATION_REPORT_PATH)"

$markdownReportPath = [System.IO.Path]::ChangeExtension($env:VALIDATION_REPORT_PATH, ".md")
Write-Output "Markdown report artifact: $markdownReportPath"

$latestJsonPath = [System.IO.Path]::Combine(
  [System.IO.Path]::GetDirectoryName($env:VALIDATION_REPORT_PATH),
  ([System.IO.Path]::GetFileNameWithoutExtension($env:VALIDATION_REPORT_PATH) -replace '-\d{8}-\d{6}$', '') + "-latest" + [System.IO.Path]::GetExtension($env:VALIDATION_REPORT_PATH)
)
$latestMarkdownPath = [System.IO.Path]::ChangeExtension($latestJsonPath, ".md")
Write-Output "Latest JSON artifact: $latestJsonPath"
Write-Output "Latest markdown artifact: $latestMarkdownPath"
