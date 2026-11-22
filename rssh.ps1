param([string]$Cmd)
$env:SSH_ASKPASS="$env:TEMP\sealask\ask.cmd"
$env:SSH_ASKPASS_REQUIRE="force"
$env:DISPLAY="localhost:0"
ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1 root@103.236.97.150 $Cmd 2>&1
