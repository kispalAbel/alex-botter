import subprocess
import os

# ---------- CONFIG ----------
NODE_PATH = r"C:\Users\D242TAN-03\Desktop\node22\node-v22.2.0-win-x64\node.exe"
BOT_JS_PATH = r"C:\Users\D242TAN-03\Desktop\alex\bot.js"
# ----------------------------

# Ellenőrizzük, hogy a bot.js létezik
if not os.path.exists(BOT_JS_PATH):
    print("Hiba: bot.js nem található!")
    exit(1)

# Node futtatása a bot.js-sel, hibák láthatóak legyenek
subprocess.run([NODE_PATH, BOT_JS_PATH], text=True)