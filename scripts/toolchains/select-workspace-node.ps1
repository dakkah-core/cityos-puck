# Dot-source in each new owning-workspace shell. The parent still selects its
# primary runtime first. No sibling paths, downloads or machine-specific pins.
$puckRepositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..') -ErrorAction Stop).Path
$puckCatalog = Get-Content -LiteralPath (Join-Path $puckRepositoryRoot 'config/toolchains/node-typescript.json') -Raw | ConvertFrom-Json
$puckExpectedVersion = [string]$puckCatalog.node
if ($puckExpectedVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid canonical Node version.' }
$puckBootstrapNode = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
$puckSelectedNode = & $puckBootstrapNode.Source (Join-Path $PSScriptRoot 'resolve-workspace-node.mjs')
if ($LASTEXITCODE -ne 0 -or -not $puckSelectedNode) { throw 'Cannot resolve the catalog Node runtime.' }
$puckSelectedNode = $puckSelectedNode.Trim()
$puckSelectedVersion = & $puckSelectedNode --version
if ($LASTEXITCODE -ne 0 -or $puckSelectedVersion.Trim() -ne "v$puckExpectedVersion") { throw 'Catalog Node runtime mismatch.' }
$puckExistingNode = Get-Command node -ErrorAction SilentlyContinue
$puckManagedAlias = Get-Variable -Name PuckCanonicalNodeAliasTarget -Scope Global -ValueOnly -ErrorAction SilentlyContinue
if ($puckExistingNode -and $puckExistingNode.CommandType -in @('Function', 'Filter')) { throw 'Remove the node function shadow before selecting the workspace runtime.' }
if ($puckExistingNode -and $puckExistingNode.CommandType -eq 'Alias' -and $puckExistingNode.Definition -ne $puckSelectedNode -and $puckExistingNode.Definition -ne $puckManagedAlias) {
    throw 'Remove the unmanaged node alias before selecting the workspace runtime.'
}
$env:PATH = "$(Split-Path -Parent $puckSelectedNode);$env:PATH"
Set-Alias -Name node -Value $puckSelectedNode -Scope Global -Force
$global:PuckCanonicalNodeAliasTarget = $puckSelectedNode
if ((& node --version).Trim() -ne "v$puckExpectedVersion") { throw 'Active Node alias does not match the catalog.' }
Write-Output "Puck selected Node v$puckExpectedVersion ($puckSelectedNode)."
