$ErrorActionPreference = 'Stop'
$manager = New-Object -ComObject WIA.DeviceManager
$infos = @($manager.DeviceInfos | Where-Object { $_.Type -eq 1 })

function DeviceName($info) {
  foreach ($property in @($info.Properties)) {
    if ($property.Name -eq 'Name') { return [string]$property.Value }
  }
  return 'Scanner'
}

if ($args[0] -eq 'list') {
  $devices = @($infos | ForEach-Object { [ordered]@{ id = [string]$_.DeviceID; name = (DeviceName $_) } })
  if ($devices.Count -eq 0) { '[]' } else { $devices | ConvertTo-Json -Compress }
  exit 0
}

if ($infos.Count -eq 0) { throw 'No scanner is connected.' }
$selected = @($infos | Where-Object { [string]$_.DeviceID -eq [string]$args[1] }) | Select-Object -First 1
if (-not $selected) { $selected = $infos[0] }
$device = $selected.Connect()
$item = $device.Items.Item(1)
foreach ($property in @($item.Properties)) {
  if ($property.Name -eq 'Horizontal Resolution' -or $property.Name -eq 'Vertical Resolution') { $property.Value = 200 }
}
$jpeg = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
$image = $item.Transfer($jpeg)
if (Test-Path -LiteralPath $args[2]) { Remove-Item -LiteralPath $args[2] -Force }
$image.SaveFile($args[2])
