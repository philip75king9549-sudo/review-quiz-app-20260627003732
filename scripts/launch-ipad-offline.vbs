Option Explicit

Dim shell, fileSystem, projectDirectory, scriptPath, command, exitCode

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

projectDirectory = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
scriptPath = fileSystem.BuildPath(projectDirectory, "scripts\start-ipad-offline.ps1")
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptPath & """"

exitCode = shell.Run(command, 0, True)

If exitCode <> 0 Then
  MsgBox "The iPad installer could not start. See ipad-launcher-error.log.", 16, "Review Quiz"
End If
