npm -install ngrok

# Ngrok Sign-up
add authtoken into ngrok configuration file  
ngrok config add-authtoken <YOUR_AUTHTOKEN>

# Host Server
ngrok http 3000

# Important 
1. "PowerShell" unable to use ngrok, use "cmd" instead.