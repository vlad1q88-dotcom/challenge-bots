' Запуск бота без окна терминала.
'
' Путь никуда вписывать не нужно: скрипт берёт папку, в которой лежит сам,
' и поднимается на уровень выше, если запущен из scripts\. Так кириллица
' в имени пользователя не ломает запуск (файлы .vbs читаются в ANSI).
'
' Запуск вручную:  двойной клик или  wscript scripts\start-bot.vbs
' Автозапуск:      см. docs/deploy.md, раздел 7а

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

folder = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FileExists(fso.BuildPath(folder, "package.json")) Then
  folder = fso.GetParentFolderName(folder)
End If

If Not fso.FileExists(fso.BuildPath(folder, "package.json")) Then
  MsgBox "Не нашёл папку бота (нет package.json)." & vbCrLf & _
         "Положи этот файл в папку pushup-bot или в pushup-bot\scripts.", 16, "pushup-bot"
  WScript.Quit 1
End If

logFile = fso.BuildPath(folder, "bot.log")
shell.CurrentDirectory = folder
shell.Run "cmd /c npm start >> """ & logFile & """ 2>&1", 0, False
