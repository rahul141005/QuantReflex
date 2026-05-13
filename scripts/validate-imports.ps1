# QuantReflex Import Path & Consistency Validator
# Scans for cross-app imports, broken require paths, and ecosystem consistency issues
# Run: powershell -ExecutionPolicy Bypass -File scripts/validate-imports.ps1

$ErrorCount = 0
$WarnCount = 0
$PassCount = 0

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  QuantReflex Import & Consistency Validation" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ════════════════════════════════════════
# CHECK 1: Cross-app imports
# ════════════════════════════════════════
Write-Host "1. Cross-app imports..." -ForegroundColor White

$mainAppFiles = Get-ChildItem -Path "main-app" -Recurse -Include "*.js","*.html" -File -ErrorAction SilentlyContinue
$adminAppFiles = Get-ChildItem -Path "super-admin-app" -Recurse -Include "*.js","*.html" -File -ErrorAction SilentlyContinue

$crossAppIssues = 0
foreach ($file in $mainAppFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "super-admin-app|coaching-admin-app") {
        Write-Host "  [FAIL] Cross-app import in $($file.FullName)" -ForegroundColor Red
        $ErrorCount++
        $crossAppIssues++
    }
}

foreach ($file in $adminAppFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "main-app/|coaching-admin-app") {
        Write-Host "  [FAIL] Cross-app import in $($file.FullName)" -ForegroundColor Red
        $ErrorCount++
        $crossAppIssues++
    }
}

if ($crossAppIssues -eq 0) {
    Write-Host "  [PASS] No cross-app imports found" -ForegroundColor Green
    $PassCount++
}

Write-Host ""

# ════════════════════════════════════════
# CHECK 2: Server-side require paths
# ════════════════════════════════════════
Write-Host "2. Server-side require paths..." -ForegroundColor White

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
    $PassCount++
}

Write-Host ""

# ════════════════════════════════════════
# CHECK 3: _toMillis consistency
# ════════════════════════════════════════
Write-Host "3. Timestamp utility consistency..." -ForegroundColor White

$toMillisFiles = @()
$adminJsFiles = Get-ChildItem -Path "super-admin-app/js" -Recurse -Include "*.js" -File -ErrorAction SilentlyContinue
foreach ($file in $adminJsFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    # Check for raw ISO-string-vs-number comparisons (the bug we fixed)
    if ($content -match '\.premiumPlusExpiry\s*[<>]=?\s*Date\.now' -or $content -match '\.trialEnd\s*[<>]=?\s*Date\.now') {
        Write-Host "  [FAIL] Raw string-vs-number timestamp comparison in $($file.Name)" -ForegroundColor Red
        $ErrorCount++
    }
}

# Verify _toMillis exists in admin views that use timestamps
$usersJs = "super-admin-app/js/views/users.js"
$paymentsJs = "super-admin-app/js/views/payments.js"

foreach ($path in @($usersJs, $paymentsJs)) {
    if (Test-Path $path) {
        $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
        if ($content -match '_toMillis') {
            Write-Host "  [PASS] _toMillis present in $(Split-Path $path -Leaf)" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  [WARN] _toMillis missing in $(Split-Path $path -Leaf)" -ForegroundColor Yellow
            $WarnCount++
        }
    }
}

Write-Host ""

# ════════════════════════════════════════
# CHECK 4: Firebase config consistency
# ════════════════════════════════════════
Write-Host "4. Firebase config consistency..." -ForegroundColor White

$mainFirebase = "main-app/js/firebase.js"
$adminFirebase = "super-admin-app/js/firebase/firebase.js"

if ((Test-Path $mainFirebase) -and (Test-Path $adminFirebase)) {
    $mainContent = Get-Content $mainFirebase -Raw -ErrorAction SilentlyContinue
    $adminContent = Get-Content $adminFirebase -Raw -ErrorAction SilentlyContinue
    
    if ($mainContent -match "projectId:\s*'([^']+)'" ) { $mainProject = $matches[1] }
    if ($adminContent -match "projectId:\s*'([^']+)'" ) { $adminProject = $matches[1] }
    
    if ($mainProject -eq $adminProject) {
        Write-Host "  [PASS] Both apps use same Firebase project: $mainProject" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host "  [FAIL] Firebase project mismatch: main=$mainProject, admin=$adminProject" -ForegroundColor Red
        $ErrorCount++
    }
} else {
    Write-Host "  [WARN] Could not verify Firebase config" -ForegroundColor Yellow
    $WarnCount++
}

Write-Host ""

# ════════════════════════════════════════
# CHECK 5: ISO 8601 timestamp compliance
# ════════════════════════════════════════
Write-Host "5. ISO 8601 timestamp compliance..." -ForegroundColor White

$serverApiFiles = Get-ChildItem -Path "super-admin-app/api" -Recurse -Include "*.js" -File -ErrorAction SilentlyContinue
$isoCompliant = $true
foreach ($file in $serverApiFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match 'new Date\(\)\.toISOString\(\)') {
        # Good - uses ISO format
    }
    # Check for non-ISO timestamp patterns
    if ($content -match 'Date\.now\(\)\s*[,;]' -and $content -match 'updatedAt.*Date\.now') {
        Write-Host "  [WARN] Possible non-ISO timestamp in $($file.Name)" -ForegroundColor Yellow
        $WarnCount++
        $isoCompliant = $false
    }
}

if ($isoCompliant) {
    Write-Host "  [PASS] All server-side timestamps use ISO 8601" -ForegroundColor Green
    $PassCount++
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Results: $PassCount passed, $ErrorCount errors, $WarnCount warnings" -ForegroundColor $(if ($ErrorCount -gt 0) { "Red" } else { "Green" })
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($ErrorCount -gt 0) {
    exit 1
}
