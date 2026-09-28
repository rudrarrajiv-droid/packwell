with open('d:/AI/pi_git/packwell/frontend/src/pages/MasterData.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(r'\"', \"'\")
with open('d:/AI/pi_git/packwell/frontend/src/pages/MasterData.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')
