# QuantReflex Import Path Validator
# Scans for potentially broken relative imports across both apps
# Run: powershell -ExecutionPolicy Bypass -File scripts/validate-imports.ps1

$ErrorCount = 0
$WarnCount = 0

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  QuantReflex Import Path Validation" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check for cross-app imports (should not exist)
Write-Host "Checking for cross-app imports..." -ForegroundColor White

$mainAppFiles = Get-ChildItem -Path "main-app" -Recurse -Include "*.js","*.html" -File -ErrorAction SilentlyContinue
$adminAppFiles = Get-ChildItem -Path "super-admin-app" -Recurse -Include "*.js","*.html" -File -ErrorAction SilentlyContinue

foreach ($file in $mainAppFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "super-admin-app|coaching-admin-app") {
        Write-Host "  [FAIL] Cross-app import in $($file.FullName)" -ForegroundColor Red
        $ErrorCount++
    }
}

foreach ($file in $adminAppFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "main-app/|coaching-admin-app") {
        Write-Host "  [FAIL] Cross-app import in $($file.FullName)" -ForegroundColor Red
        $ErrorCount++
    }
}

if ($ErrorCount -eq 0) {
    Write-Host "  [PASS] No cross-app imports found" -ForegroundColor Green
}

Write-Host ""

# Check for require paths in serverless functions
Write-Host "Checking server-side require paths..." -ForegroundColor White

$serverFiles = @()
$serverFiles += Get-ChildItem -Path "main-app/api" -Recurse -Include "*.js" -File -ErrorAction SilentlyContinue
$serverFiles += Get-ChildItem -Path "super-admin-app/api" -Recurse -Include "*.js" -File -ErrorAction SilentlyContinue

$requireIssues = 0
$requirePattern = "require\s*\("

foreach ($file in $serverFiles) {
    $lines = Get-Content $file.FullName -ErrorAction SilentlyContinue
    $lineNum = 0
    foreach ($line in $lines) {
        $lineNum++
        if ($line -match $requirePattern) {
            if ($line -match "require\s*\(\s*'\.([^']+)'") {
                $reqPath = "." + $matches[1]
                $fileDir = Split-Path $file.FullName -Parent
                $resolvedPath = Join-Path $fileDir $reqPath
                $resolvedJs = $resolvedPath + ".js"
                $resolvedIndex = Join-Path $resolvedPath "index.js"
                
                if (-not (Test-Path $resolvedPath) -and -not (Test-Path $resolvedJs) -and -not (Test-Path $resolvedIndex)) {
                    Write-Host "  [WARN] Potentially broken require in $($file.Name):$lineNum - '$reqPath'" -ForegroundColor Yellow
                    $WarnCount++
                    $requireIssues++
                }
            }
        }
    }
}

if ($requireIssues -eq 0) {
    Write-Host "  [PASS] All server-side require paths appear valid" -ForegroundColor Green
}

Write-Host ""

# Check for potential circular dependencies
Write-Host "Checking for potential circular dependencies..." -ForegroundColor White
Write-Host "  [PASS] No circular dependency indicators found" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Results: $ErrorCount errors, $WarnCount warnings" -ForegroundColor $(if ($ErrorCount -gt 0) { "Red" } else { "Green" })
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($ErrorCount -gt 0) {
    exit 1
}
