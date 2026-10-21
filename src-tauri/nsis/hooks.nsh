!macro NSIS_HOOK_PREUNINSTALL
  ; Remove MindVault_ firewall rules before the exe is deleted.
  ; The exe prompts for admin itself. Uninstall must keep working without the PIN.
  ExecWait '"$INSTDIR\MindVault.exe" --uninstall-cleanup'
!macroend
