# Remove all console.log statements with 📊 emoji from the files
$files = @(
    "src\pages\Arrematantes.tsx",
    "src\pages\Faturas.tsx"
)

foreach ($file in $files) {
    $content = Get-Content $file -Raw -Encoding UTF8
    # Remove console.log statements that span multiple lines
    $content = $content -replace "console\.log\('📊[^)]+\{[^}]+\}\);?[\r\n]*", ""
    $content = $content -replace "[\r\n]{3,}", "`r`n`r`n"
    Set-Content $file -Value $content -Encoding UTF8 -NoNewline
    Write-Host "Processed $file"
}
