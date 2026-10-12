# Commits and pushes everything new in this repo as Attackins,
# then prints the public links for any images in that commit.
# Run:  powershell -ExecutionPolicy Bypass -File .\push.ps1
# Optional message:  ... -File .\push.ps1 "Sheet 02 crops"

param([string]$Message = "Add reference images")

Set-Location $PSScriptRoot

$expected = "100657799+Attackins@users.noreply.github.com"
$email  = git config user.email
$remote = git remote get-url origin

if ($email -ne $expected) {
    Write-Host "STOP: this repo would commit as '$email', not Attackins. Nothing was pushed." -ForegroundColor Red
    exit 1
}
if ($remote -notmatch "github\.com/Attackins/") {
    Write-Host "STOP: remote is '$remote', not an Attackins repo. Nothing was pushed." -ForegroundColor Red
    exit 1
}

git add -A
if (-not (git status --porcelain)) {
    Write-Host "Nothing new to push."
    exit 0
}

git commit -m $Message
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed. The commit is saved locally; fix the login and run this again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Public links:" -ForegroundColor Green
$base = "https://raw.githubusercontent.com/Attackins/beheaded-refs/main/"
git diff-tree --no-commit-id --name-only -r HEAD | ForEach-Object {
    if ($_ -match '\.(png|jpe?g|webp)$') {
        $path = ($_ -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
        $base + $path
    }
}
