; Ajouts à l'installateur classique (npm run dist). electron-builder inclut automatiquement
; ce fichier (build/installer.nsh) ; les raccourcis sont créés par l'installateur lui-même.

; Après la copie des fichiers : inscription dans « Ouvrir avec » et « Applications par défaut »,
; par le même code que le bouton « Intégrer » des paramètres (src/main/windows-integration.js).
!macro customInstall
  ; Folio s'appelait Plume : désinstalle l'ancienne version (les paramètres sont repris au premier lancement).
  ${if} ${FileExists} "$LOCALAPPDATA\Programs\Plume\Uninstall Plume.exe"
    ExecWait '"$LOCALAPPDATA\Programs\Plume\Uninstall Plume.exe" /S _?=$LOCALAPPDATA\Programs\Plume'
    RMDir /r "$LOCALAPPDATA\Programs\Plume"
  ${endIf}
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --register --no-shortcuts'
!macroend

; Désinstallation (mais pas mise à jour) : retire ce qu'a écrit --register.
; À garder en accord avec removalLines() dans src/main/windows-integration.js.
!macro folioRemoveOpenWith EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Folio.Markdown"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\Folio.Markdown"
    DeleteRegKey HKCU "Software\Classes\Applications\Folio.exe"
    DeleteRegKey HKCU "Software\Folio"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Folio"
    !insertmacro folioRemoveOpenWith "md"
    !insertmacro folioRemoveOpenWith "markdown"
    !insertmacro folioRemoveOpenWith "mdown"
    !insertmacro folioRemoveOpenWith "mkd"
    !insertmacro folioRemoveOpenWith "mkdn"
    !insertmacro folioRemoveOpenWith "mdwn"
  ${endIf}
!macroend
