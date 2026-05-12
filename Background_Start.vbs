Set WshShell = CreateObject("WScript.Shell")
' Run the Vite Dashboard hidden
WshShell.CurrentDirectory = "C:\Users\DELL\.gemini\antigravity\scratch\choicecartcrm8989815459-main"
WshShell.Run "cmd.exe /c npm run dev", 0, false

' Run the WhatsApp Bridge hidden
WshShell.CurrentDirectory = "C:\Users\DELL\.gemini\antigravity\scratch\choicecartcrm8989815459-main\wa-bridge"
WshShell.Run "cmd.exe /c node index.js", 0, false
