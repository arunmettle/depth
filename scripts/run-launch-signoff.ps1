param(
  [string]$ReportDirectory = "artifacts",
  [switch]$SkipWebChecks,
  [switch]$SkipDelegatedGoals
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$launchAuditReportPath = Join-Path $ReportDirectory "goal-10-validation-$timestamp.json"
$summaryReportPath = Join-Path $ReportDirectory "launch-evidence-summary-$timestamp.json"

$env:VALIDATION_REPORT_PATH = $launchAuditReportPath

if ($SkipWebChecks.IsPresent) {
  $env:VALIDATION_RUN_WEB_TEST = "false"
  $env:VALIDATION_RUN_WEB_BUILD = "false"
}

if ($SkipDelegatedGoals.IsPresent) {
  $env:VALIDATION_INCLUDE_GOALS = "__none__"
}

Write-Output "Goal 10 validation report will be written to $launchAuditReportPath"

node scripts/validate-goal-10.mjs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output ""
Write-Output "Goal 10 validation completed successfully."
Write-Output "JSON report artifact: $launchAuditReportPath"

$launchAuditMarkdownPath = [System.IO.Path]::ChangeExtension($launchAuditReportPath, ".md")
Write-Output "Markdown report artifact: $launchAuditMarkdownPath"

$launchAuditLatestJsonPath = [System.IO.Path]::Combine(
  [System.IO.Path]::GetDirectoryName($launchAuditReportPath),
  ([System.IO.Path]::GetFileNameWithoutExtension($launchAuditReportPath) -replace '-\d{8}-\d{6}$', '') + "-latest" + [System.IO.Path]::GetExtension($launchAuditReportPath)
)
$launchAuditLatestMarkdownPath = [System.IO.Path]::ChangeExtension($launchAuditLatestJsonPath, ".md")
Write-Output "Latest JSON artifact: $launchAuditLatestJsonPath"
Write-Output "Latest markdown artifact: $launchAuditLatestMarkdownPath"

$env:VALIDATION_REPORT_PATH = $summaryReportPath

Write-Output ""
Write-Output "Launch evidence summary will be written to $summaryReportPath"

node scripts/summarize-launch-evidence.mjs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$summaryLatestJsonPath = [System.IO.Path]::Combine(
  [System.IO.Path]::GetDirectoryName($summaryReportPath),
  ([System.IO.Path]::GetFileNameWithoutExtension($summaryReportPath) -replace '-\d{8}-\d{6}$', '') + "-latest" + [System.IO.Path]::GetExtension($summaryReportPath)
)

Write-Output ""
Write-Output "Launch evidence summary completed successfully."
Write-Output "Summary JSON artifact: $summaryReportPath"
Write-Output "Latest summary JSON artifact: $summaryLatestJsonPath"
