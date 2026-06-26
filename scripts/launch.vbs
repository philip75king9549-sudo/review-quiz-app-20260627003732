Option Explicit

Dim shell, fileSystem, projectDirectory, scriptPath, command, exitCode

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

projectDirectory = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
scriptPath = fileSystem.BuildPath(projectDirectory, "scripts\start-app.ps1")
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptPath & """"

exitCode = shell.Run(command, 0, True)

If exitCode <> 0 Then
  MsgBox "Review Quiz could not start. See launcher-error.log in the project folder.", 16, "Review Quiz"
End If
