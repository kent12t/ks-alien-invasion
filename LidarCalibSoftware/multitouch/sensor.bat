@echo off
ping 10.1.4.165 -n 15
start /max "Omnigram.net" "C:\remote\multitouch\server.exe" "C:\remote\multitouch\trivex-single.otxml"