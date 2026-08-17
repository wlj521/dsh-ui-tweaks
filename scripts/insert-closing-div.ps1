$path = 'D:\dsh-project\dsh-ui-tweaks\src\client\gitbar.tsx'
$c = Get-Content $path
$insertIdx = -1
for ($i=0; $i -lt $c.Length - 1; $i++) {
  $curr = $c[$i]
  $next = $c[$i+1]
  if ($curr -eq '              ))}' -and $next -eq '            <div') {
    $insertIdx = $i
    break
  }
}
if ($insertIdx -eq -1) { throw "Pattern not found at index $insertIdx" }
Write-Host "Inserting after index $insertIdx"

$before = $c[0..$insertIdx]
$after = $c[($insertIdx+1)..($c.Length-1)]

$insert = @(
  '            </div>'
)

$new = $before + $insert + $after
Set-Content -Path $path -Value $new -Encoding UTF8
Write-Host "Done. Lines: $($new.Length)"

$c2 = Get-Content $path
for ($j=$insertIdx; $j -lt [Math]::Min($insertIdx+8, $c2.Length); $j++) { Write-Host ('{0,4}: [{1}]' -f ($j+1), $c2[$j]) }
