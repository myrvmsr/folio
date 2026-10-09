# Test signing is confined to an ephemeral GitHub-hosted Windows runner.
# The unsigned submission package is never modified or replaced by a test copy.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:FOLIO_EPHEMERAL_RUNNER -ne 'github-hosted') {
    throw 'Ce test doit uniquement être lancé dans une machine Windows temporaire de GitHub Actions.'
}
$workspace = (Resolve-Path -LiteralPath $env:GITHUB_WORKSPACE).Path
$output = Join-Path $workspace '.folio-checks/store-install'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$packages = @(Get-ChildItem -LiteralPath (Join-Path $workspace 'release/store'), (Join-Path $workspace 'release/store-preview') -Filter '*.msix' -File -ErrorAction SilentlyContinue)
if ($packages.Count -ne 1) { throw 'Un seul MSIX doit être présent pour ce test.' }
$source = $packages[0].FullName
$originalHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$testPackage = Join-Path $output 'Folio-CI-Test.msix'
Copy-Item -LiteralPath $source -Destination $testPackage
$archive = [System.IO.Compression.ZipFile]::OpenRead($source)
try {
    $reader = [System.IO.StreamReader]::new($archive.GetEntry('AppxManifest.xml').Open())
    try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $archive.Dispose() }
$name = [string]$manifest.Package.Identity.Name
$publisher = [string]$manifest.Package.Identity.Publisher
if (Get-AppxPackage -Name $name) { throw 'Le package est déjà installé dans cette machine de test.' }
$kitRoot = Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Windows Kits/10/bin'
$sdk = Get-ChildItem -LiteralPath $kitRoot -Directory | Where-Object Name -Match '^10\.0\.\d+\.0$' |
    Sort-Object { [version]$_.Name } -Descending | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'x64/signtool.exe') } | Select-Object -First 1
if (-not $sdk) { throw 'SignTool du SDK Microsoft est absent.' }
$signtool = Join-Path $sdk.FullName 'x64/signtool.exe'
$certificate = $null
$installed = $null
$activeProcess = $null
try {
    $certificate = New-SelfSignedCertificate -Type Custom -KeyUsage DigitalSignature -HashAlgorithm SHA256 `
        -CertStoreLocation 'Cert:\CurrentUser\My' -Subject $publisher -FriendlyName 'Folio CI test only' `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    $publicCertificate = Join-Path $output 'test-certificate.cer'
    Export-Certificate -Cert $certificate -FilePath $publicCertificate | Out-Null
    Import-Certificate -FilePath $publicCertificate -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
    & $signtool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $testPackage
    if ($LASTEXITCODE -ne 0) { throw 'Signature de la copie de test impossible.' }
    Add-AppxPackage -Path $testPackage
    $installed = Get-AppxPackage -Name $name
    if (-not $installed -or [string]$installed.Version -ne [string]$manifest.Package.Identity.Version) { throw 'Installation MSIX non confirmée.' }
    $aumid = $installed.PackageFamilyName + '!Folio'
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace FolioCI {
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint pid);
    [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint pid);
    [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr items, out uint pid);
  }
  public static class Activation {
    public static uint Launch(string id, string arguments) {
      var type = Type.GetTypeFromCLSID(new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c"));
      var manager = (IApplicationActivationManager)Activator.CreateInstance(type);
      uint pid;
      int result = manager.ActivateApplication(id, arguments, 2, out pid);
      Marshal.ThrowExceptionForHR(result);
      return pid;
    }
  }
}
'@
    $fixture = "# Folio`n`nUne note **Markdown**.`n`n" + '```js' + "`nconsole.log('Folio');`n" + '```' + "`n`n" + '$$x^2 + y^2 = z^2$$' + "`n`n" + '```mermaid' + "`nflowchart LR`n A[Lecture] --> B[Edition]`n" + '```' + "`n"
    $reports = @()
    foreach ($scenario in @('compatibility', 'files', 'autosave', 'rootrename')) {
        $directory = Join-Path $output $scenario
        $notes = Join-Path $directory 'Notes de test été #100%'
        New-Item -ItemType Directory -Path $notes -Force | Out-Null
        $document = Join-Path $notes 'Bienvenue.md'
        [IO.File]::WriteAllText($document, $fixture, [Text.UTF8Encoding]::new($false))
        $capture = Join-Path $directory 'capture.png'
        $arguments = @($document, "--snap=$capture", "--snap-folders=$notes", "--snap-userdata=$(Join-Path $directory 'profile')", "--snap-selftest=$scenario", '--snap-autosave=afterEdit')
        $commandLine = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
        $activeProcess = [FolioCI.Activation]::Launch($aumid, $commandLine)
        $deadline = (Get-Date).AddSeconds(120)
        while (-not (Test-Path -LiteralPath "$capture.json")) {
            if ((Get-Date) -gt $deadline) { throw "Le lancement Windows de $scenario n’a pas produit de résultat." }
            Start-Sleep -Milliseconds 500
        }
        $result = Get-Content -LiteralPath "$capture.json" -Raw | ConvertFrom-Json
        if (-not $result.packaged -or -not $result.windowsStore -or $result.arch -ne 'x64') { throw 'Le test ne tourne pas dans le contexte du MSIX installé.' }
        if ($result.failures.Count -ne 0 -or $result.checks.Count -eq 0 -or @($result.checks | Where-Object { -not $_.ok }).Count -ne 0) { throw "Échec des contrôles MSIX : $scenario" }
        if (-not $result.windowsIntegration.managedByStore -or $result.windowsIntegration.available) { throw 'Les associations ne sont pas gérées par le package.' }
        if (-not $result.pdf -or (Get-Item -LiteralPath "$capture.pdf").Length -lt 500 -or (Get-Item -LiteralPath $capture).Length -lt 1000) { throw 'Capture ou export PDF invalide.' }
        $target = Get-Process -Id $activeProcess -ErrorAction SilentlyContinue
        if ($target -and -not $target.WaitForExit(15000)) { throw 'Folio ne se ferme pas après ses contrôles.' }
        $activeProcess = $null
        $reports += [pscustomobject]@{ scenario = $scenario; checks = $result.checks.Count; windowsStore = $result.windowsStore; packaged = $result.packaged; status = 'passed' }
        Write-Host "MSIX installé : $scenario réussi ($($result.checks.Count) contrôles)."
    }
    $reports | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $output 'installation-checks.json') -Encoding utf8
    Remove-AppxPackage -Package $installed.PackageFullName
    $installed = $null
    if (Get-AppxPackage -Name $name) { throw 'La désinstallation MSIX a échoué.' }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $originalHash) { throw 'Le package de soumission a été modifié.' }
    $infoFile = Join-Path $packages[0].DirectoryName 'package-info.json'
    $info = Get-Content -LiteralPath $infoFile -Raw | ConvertFrom-Json
    $info.installationTest = 'passed'
    $info | Add-Member -NotePropertyName installationTestEnvironment -NotePropertyValue 'Ephemeral GitHub-hosted Windows runner; test signing only' -Force
    $info | Add-Member -NotePropertyName startMenuActivationTest -NotePropertyValue 'passed' -Force
    $info | Add-Member -NotePropertyName uninstallationTest -NotePropertyValue 'passed' -Force
    $info | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $infoFile -Encoding utf8
    Write-Host 'Installation, lancement Windows et désinstallation vérifiés. Le MSIX de soumission reste non signé et inchangé.'
} finally {
    if ($activeProcess) { Stop-Process -Id $activeProcess -Force -ErrorAction SilentlyContinue }
    if ($installed) { Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction Continue }
    if ($certificate) {
        Remove-Item -LiteralPath ("Cert:\LocalMachine\TrustedPeople\" + $certificate.Thumbprint) -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath ("Cert:\CurrentUser\My\" + $certificate.Thumbprint) -Force -ErrorAction SilentlyContinue
    }
}
