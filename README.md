# Kinwin Mobile

Detta är den nya mobilappen för Kinwin, byggd från grunden med Expo, React Native och TypeScript. Samma kodbas ska stödja iPhone och Android.

Denna README beskriver bara hur man kör appen lokalt. För aktuell status på vad som faktiskt är byggt (backend, inloggning, betalningar, m.m.) och vad som återstår före lansering, se `docs/LAUNCH_READINESS.md`.

## Förutsättningar

- Node.js LTS och npm
- Appen Expo Go installerad på telefonen
- Datorn och telefonen på samma nätverk

## Installera

Öppna en terminal i projektmappen och kör:

```bash
npm install
```

## Starta appen

Kör exakt detta kommando:

```bash
npm start
```

Terminalen visar en QR-kod när Expo är redo. Låt terminalen vara öppen medan du testar.

## Testa på en fysisk iPhone

1. Installera Expo Go från App Store.
2. Anslut iPhone och datorn till samma Wi-Fi.
3. Kör `npm start` i projektmappen.
4. Öppna Kamera på iPhone och skanna QR-koden.
5. Tryck på länken som visas för att öppna projektet i Expo Go.

Windows kan inte köra Apples inbyggda iOS-simulator. En fysisk iPhone med Expo Go fungerar för denna grund.

## Testa på en fysisk Android-telefon

1. Installera Expo Go från Google Play.
2. Anslut telefonen och datorn till samma Wi-Fi.
3. Kör `npm start` i projektmappen.
4. Öppna Expo Go och välj att skanna en QR-kod.
5. Skanna QR-koden i terminalen.

## Om telefonen inte kan ansluta

1. Kontrollera att datorn och telefonen använder samma Wi-Fi och stäng av VPN tillfälligt.
2. Tillåt Node.js/Expo genom Windows-brandväggen om Windows frågar.
3. Stoppa Expo med `Ctrl+C` och starta om med `npm start`.
4. Om det fortfarande inte fungerar, kör `npx expo start --tunnel` och skanna den nya QR-koden. Tunnel kan starta långsammare.

## Kontroller för utveckling

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

## Status

Se `docs/LAUNCH_READINESS.md` för en aktuell, evidensbaserad genomgång av vad som är klart och vad som återstår före en intern betatest, extern beta och publik lansering.

Se `docs/PRODUCT_STATUS.md` för en fullständig produktinventering: vad som är byggt, delvis byggt, planerat eller inte påbörjat, funktion för funktion.
