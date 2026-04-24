# ============================================================
# backup-manual.ps1
# Script backup thủ công cho Windows (PowerShell)
#
# Dùng khi:
#   - Trước khi kiểm kho / chốt kho
#   - Trước khi nâng cấp hệ thống
#   - Trước khi điều chỉnh tồn kho số lượng lớn
#
# Cách dùng:
#   .\scripts\backup-manual.ps1
#   .\scripts\backup-manual.ps1 -MongoUri "mongodb://..." -BackupDir "C:\backups"
#
# Yêu cầu: mongodump đã được cài và có trong PATH
# Tải: https://www.mongodb.com/try/download/database-tools
# ============================================================

param(
    [string]$MongoUri = $env:MONGO_URI,
    [string]$BackupDir = (Join-Path $PSScriptRoot "..\backups"),
    [int]$MaxBackups = 14
)

# ── Màu sắc output cho dễ đọc ──────────────────────────────
function Write-Success($msg) { Write-Host "[OK]  $msg" -ForegroundColor Green }
function Write-Info($msg)    { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Warn($msg)    { Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Fail($msg)    { Write-Host "[XX] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "======================================" -ForegroundColor Magenta
Write-Host "  BACKUP THỦ CÔNG - HỆ THỐNG KIOT   " -ForegroundColor Magenta
Write-Host "======================================" -ForegroundColor Magenta
Write-Host ""

# ── Kiểm tra MONGO_URI ─────────────────────────────────────
if (-not $MongoUri) {
    # Thử đọc từ file .env nếu có
    $envFile = Join-Path $PSScriptRoot "..\.env"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile | Where-Object { $_ -match "^MONGO_URI=" }
        if ($envContent) {
            $MongoUri = ($envContent -split "=", 2)[1].Trim().Trim('"')
            Write-Info "Đọc MONGO_URI từ file .env"
        }
    }
}

if (-not $MongoUri) {
    Write-Fail "Không tìm thấy MONGO_URI. Hãy:"
    Write-Fail "  1. Đặt biến môi trường MONGO_URI trước khi chạy script"
    Write-Fail "  2. Hoặc thêm MONGO_URI=... vào file .env trong thư mục backend"
    exit 1
}

# ── Kiểm tra mongodump có trong PATH không ─────────────────
try {
    $null = & mongodump --version 2>&1
    Write-Success "mongodump đã sẵn sàng"
} catch {
    Write-Fail "Không tìm thấy mongodump trong PATH"
    Write-Fail "Tải về tại: https://www.mongodb.com/try/download/database-tools"
    exit 1
}

# ── Tạo thư mục backup nếu chưa có ────────────────────────
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Info "Đã tạo thư mục backup: $BackupDir"
}

# ── Tạo tên file với timestamp ─────────────────────────────
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$dbFileName = "backup-$timestamp.gz"
$dbFilePath = Join-Path $BackupDir $dbFileName

# ── Chạy mongodump ─────────────────────────────────────────
Write-Info "Bắt đầu backup MongoDB → $dbFileName"
$startTime = Get-Date

try {
    & mongodump --uri="$MongoUri" --archive="$dbFilePath" --gzip
    if ($LASTEXITCODE -ne 0) { throw "mongodump thoát với exit code $LASTEXITCODE" }
} catch {
    Write-Fail "Backup MongoDB thất bại: $_"
    if (Test-Path $dbFilePath) { Remove-Item $dbFilePath -Force }
    exit 1
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
$fileSizeKB = [math]::Round((Get-Item $dbFilePath).Length / 1024, 0)
Write-Success "MongoDB backup hoàn thành: $dbFileName ($fileSizeKB KB) trong $elapsed giây"

# ── Backup thư mục uploads (nếu có) ───────────────────────
$uploadsDir = Join-Path $PSScriptRoot "..\uploads"
if (Test-Path $uploadsDir) {
    $uploadsFileName = "uploads-$timestamp.zip"
    $uploadsFilePath = Join-Path $BackupDir $uploadsFileName
    Write-Info "Bắt đầu backup uploads → $uploadsFileName"
    try {
        Compress-Archive -Path "$uploadsDir\*" -DestinationPath $uploadsFilePath -Force
        $uploadsSizeKB = [math]::Round((Get-Item $uploadsFilePath).Length / 1024, 0)
        Write-Success "Uploads backup hoàn thành: $uploadsFileName ($uploadsSizeKB KB)"
    } catch {
        Write-Warn "Không backup được uploads: $_"
    }
} else {
    Write-Info "Không có thư mục uploads, bỏ qua"
}

# ── Retention: xóa file backup cũ ─────────────────────────
Write-Info "Kiểm tra retention (giữ tối đa $MaxBackups bản)..."

$dbFiles = Get-ChildItem -Path $BackupDir -Filter "backup-*.gz" |
    Sort-Object LastWriteTime -Descending
if ($dbFiles.Count -gt $MaxBackups) {
    $toDelete = $dbFiles | Select-Object -Skip $MaxBackups
    foreach ($file in $toDelete) {
        Remove-Item $file.FullName -Force
        Write-Info "Đã xóa file cũ: $($file.Name)"
    }
}

$uploadsFiles = Get-ChildItem -Path $BackupDir -Filter "uploads-*.zip" |
    Sort-Object LastWriteTime -Descending
if ($uploadsFiles.Count -gt $MaxBackups) {
    $toDelete = $uploadsFiles | Select-Object -Skip $MaxBackups
    foreach ($file in $toDelete) {
        Remove-Item $file.FullName -Force
        Write-Info "Đã xóa file uploads cũ: $($file.Name)"
    }
}

# ── Hiển thị danh sách backup hiện có ─────────────────────
Write-Host ""
Write-Host "── Danh sách backup hiện có ────────────" -ForegroundColor Cyan
$allBackups = Get-ChildItem -Path $BackupDir -Filter "backup-*.gz" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 10
foreach ($file in $allBackups) {
    $sizeKB = [math]::Round($file.Length / 1024, 0)
    Write-Host "  $($file.Name)  ($sizeKB KB)  $($file.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))"
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Magenta
Write-Success "BACKUP HOÀN THÀNH!"
Write-Host "  Thư mục: $BackupDir" -ForegroundColor White
Write-Host "======================================" -ForegroundColor Magenta
Write-Host ""
