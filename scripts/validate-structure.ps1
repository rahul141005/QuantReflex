# QuantReflex Monorepo Structure Validator
# Run: powershell -ExecutionPolicy Bypass -File scripts/validate-structure.ps1

$ErrorCount = 0
$WarnCount = 0
$PassCount = 0

function Test-Path-Report {
    param([string]$Path, [string]$Label, [bool]$Required = $true)
    
    if (Test-Path $Path) {
        Write-Host "  [PASS] $Label" -ForegroundColor Green
        $script:PassCount++
    } elseif ($Required) {
        Write-Host "  [FAIL] $Label — MISSING: $Path" -ForegroundColor Red
        $script:ErrorCount++
    } else {
        Write-Host "  [WARN] $Label — not found (optional)" -ForegroundColor Yellow
        $script:WarnCount++
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  QuantReflex Monorepo Structure Validation" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Root files
Write-Host "Root Files:" -ForegroundColor White
Test-Path-Report "package.json" "Root package.json"
Test-Path-Report "README.md" "Root README.md"
Test-Path-Report ".gitignore" "Root .gitignore"

Write-Host ""

# Main App
Write-Host "Main App (main-app/):" -ForegroundColor White
Test-Path-Report "main-app/index.html" "index.html"
Test-Path-Report "main-app/package.json" "package.json"
Test-Path-Report "main-app/vercel.json" "vercel.json"
Test-Path-Report "main-app/manifest.json" "manifest.json"
Test-Path-Report "main-app/service-worker.js" "service-worker.js"
Test-Path-Report "main-app/js/app.js" "js/app.js"
Test-Path-Report "main-app/js/firebase.js" "js/firebase.js"
Test-Path-Report "main-app/js/auth.js" "js/auth.js"
Test-Path-Report "main-app/js/firestore-sync.js" "js/firestore-sync.js"
Test-Path-Report "main-app/js/drill-engine.js" "js/drill-engine.js"
Test-Path-Report "main-app/js/paywall.js" "js/paywall.js"
Test-Path-Report "main-app/js/questions.js" "js/questions.js"
Test-Path-Report "main-app/js/state/store.js" "js/state/store.js"
Test-Path-Report "main-app/js/services/question-bank-service.js" "js/services/question-bank-service.js"
Test-Path-Report "main-app/css/style.css" "css/style.css"
Test-Path-Report "main-app/api/_lib/middleware.js" "api/_lib/middleware.js"
Test-Path-Report "main-app/api/ai/explain.js" "api/ai/explain.js"
Test-Path-Report "main-app/api/payment/create-order.js" "api/payment/create-order.js"
Test-Path-Report "main-app/api/payment/verify.js" "api/payment/verify.js"
Test-Path-Report "main-app/services/aiService.js" "services/aiService.js"
Test-Path-Report "main-app/services/paymentService.js" "services/paymentService.js"

Write-Host ""

# Super Admin App
Write-Host "Super Admin App (super-admin-app/):" -ForegroundColor White
Test-Path-Report "super-admin-app/index.html" "index.html"
Test-Path-Report "super-admin-app/package.json" "package.json"
Test-Path-Report "super-admin-app/vercel.json" "vercel.json"
Test-Path-Report "super-admin-app/manifest.json" "manifest.json"
Test-Path-Report "super-admin-app/sw.js" "sw.js"
Test-Path-Report "super-admin-app/js/app.js" "js/app.js"
Test-Path-Report "super-admin-app/js/firebase/firebase.js" "js/firebase/firebase.js"
Test-Path-Report "super-admin-app/js/firebase/auth.js" "js/firebase/auth.js"
Test-Path-Report "super-admin-app/js/services/api.js" "js/services/api.js"
Test-Path-Report "super-admin-app/js/state/store.js" "js/state/store.js"
Test-Path-Report "super-admin-app/js/views/users.js" "js/views/users.js"
Test-Path-Report "super-admin-app/js/views/questions.js" "js/views/questions.js"
Test-Path-Report "super-admin-app/css/admin-style.css" "css/admin-style.css"
Test-Path-Report "super-admin-app/api/_lib/firebase-admin.js" "api/_lib/firebase-admin.js"
Test-Path-Report "super-admin-app/api/admin/entitlements.js" "api/admin/entitlements.js"

Write-Host ""

# Coaching Admin App
Write-Host "Coaching Admin App (coaching-admin-app/):" -ForegroundColor White
Test-Path-Report "coaching-admin-app/README.md" "README.md"
Test-Path-Report "coaching-admin-app/package.json" "package.json"
Test-Path-Report "coaching-admin-app/vercel.json" "vercel.json"

Write-Host ""

# Shared Layer
Write-Host "Shared Layer (shared/):" -ForegroundColor White
Test-Path-Report "shared/README.md" "README.md"
Test-Path-Report "shared/constants/entitlements.js" "constants/entitlements.js"
Test-Path-Report "shared/schemas/question-schema.json" "schemas/question-schema.json"
Test-Path-Report "shared/schemas/user-schema.json" "schemas/user-schema.json"
Test-Path-Report "shared/schemas/coaching-schema.json" "schemas/coaching-schema.json"

Write-Host ""

# Firestore
Write-Host "Firestore (firestore/):" -ForegroundColor White
Test-Path-Report "firestore/README.md" "README.md"
Test-Path-Report "firestore/schema-docs/users-collection.md" "schema-docs/users-collection.md"
Test-Path-Report "firestore/schema-docs/questions-collection.md" "schema-docs/questions-collection.md"
Test-Path-Report "firestore/schema-docs/coachings-collection.md" "schema-docs/coachings-collection.md"
Test-Path-Report "firestore/schema-docs/timestamp-strategy.md" "schema-docs/timestamp-strategy.md"

Write-Host ""

# Docs
Write-Host "Documentation (docs/):" -ForegroundColor White
Test-Path-Report "docs/ECOSYSTEM_OVERVIEW.md" "ECOSYSTEM_OVERVIEW.md"
Test-Path-Report "docs/DEPLOYMENT_GUIDE.md" "DEPLOYMENT_GUIDE.md"
Test-Path-Report "docs/FIRESTORE_COLLECTIONS.md" "FIRESTORE_COLLECTIONS.md"
Test-Path-Report "docs/ENTITLEMENT_SYSTEM.md" "ENTITLEMENT_SYSTEM.md"
Test-Path-Report "docs/QUESTION_SCHEMA.md" "QUESTION_SCHEMA.md"
Test-Path-Report "docs/ENVIRONMENT_VARIABLES.md" "ENVIRONMENT_VARIABLES.md"
Test-Path-Report "docs/SYNCHRONIZATION_PHILOSOPHY.md" "SYNCHRONIZATION_PHILOSOPHY.md"

Write-Host ""

# Node modules check
Write-Host "Dependencies:" -ForegroundColor White
Test-Path-Report "main-app/node_modules" "main-app/node_modules"
Test-Path-Report "super-admin-app/node_modules" "super-admin-app/node_modules"

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Results: $PassCount passed, $ErrorCount failed, $WarnCount warnings" -ForegroundColor $(if ($ErrorCount -gt 0) { "Red" } else { "Green" })
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($ErrorCount -gt 0) {
    exit 1
}
