' Starts Study Manager in the background with no window.
' install-windows.bat runs this at every login. The app is then at http://localhost:5173
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.CurrentDirectory = appDir
' Port 5173 keeps the same address (and the same saved courses) as "npm run dev".
shell.Environment("PROCESS")("PORT") = "5173"
shell.Run "cmd /c npm start > server.log 2>&1", 0, False
