@echo off
echo Installation de l'image Hero moderne...
copy "C:\Users\tessiers\.gemini\antigravity\brain\c1064485-910a-44ba-a841-a54445b2f288\billiards_stable_modern_v2_1778703548881.png" "c:\Users\tessiers\MonClubBillard\PortailUnifie\hero.png"
echo Installation de l'image Tournoi...
copy "C:\Users\tessiers\.gemini\antigravity\brain\c1064485-910a-44ba-a841-a54445b2f288\billiards_tournament_modern_1778704040846.png" "c:\Users\tessiers\MonClubBillard\PortailUnifie\tournaments.png"
echo Installation de l'image Gestion...
copy "C:\Users\tessiers\.gemini\antigravity\brain\c1064485-910a-44ba-a841-a54445b2f288\club_management_modern_1778704550517.png" "c:\Users\tessiers\MonClubBillard\PortailUnifie\management.png"


if %errorlevel% equ 0 (
    echo [SUCCES] L'image hero a ete installee avec succes !
) else (
    echo [ERREUR] Impossible de copier l'image. Verifiez les droits d'acces.
)
pause
