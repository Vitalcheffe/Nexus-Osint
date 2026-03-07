#!/bin/bash
# ============================================================
# NEXUS — Fix repo structure
# Lance ce script depuis la racine du repo dans Codespaces
# ============================================================

set -e
echo "🔧 Réorganisation de la structure NEXUS..."

# Créer le dossier src/
mkdir -p src/app/api
mkdir -p src/components
mkdir -p src/core
mkdir -p src/lib
mkdir -p src/nexus
mkdir -p src/plugins

# ── Déplacer app/ → src/app/ ─────────────────────────────────
if [ -d "app" ]; then
  echo "→ app/ → src/app/"
  cp -r app/* src/app/
  rm -rf app
fi

# ── Déplacer components/ → src/components/ ───────────────────
if [ -d "components" ]; then
  echo "→ components/ → src/components/"
  cp -r components/* src/components/
  rm -rf components
fi

# ── Déplacer core/ → src/core/ ───────────────────────────────
if [ -d "core" ]; then
  echo "→ core/ → src/core/"
  cp -r core/* src/core/
  rm -rf core
fi

# ── Déplacer lib/ → src/lib/ ─────────────────────────────────
if [ -d "lib" ]; then
  echo "→ lib/ → src/lib/"
  cp -r lib/* src/lib/
  rm -rf lib
fi

# ── Déplacer nexus/ → src/nexus/ ─────────────────────────────
if [ -d "nexus" ]; then
  echo "→ nexus/ → src/nexus/"
  cp -r nexus/* src/nexus/
  rm -rf nexus
fi

# ── Déplacer plugins/ → src/plugins/ ─────────────────────────
if [ -d "plugins" ]; then
  echo "→ plugins/ → src/plugins/"
  cp -r plugins/* src/plugins/
  rm -rf plugins
fi

# ── Déplacer instrumentation.ts → src/ ───────────────────────
if [ -f "instrumentation.ts" ]; then
  echo "→ instrumentation.ts → src/"
  mv instrumentation.ts src/
fi

# ── Dossiers API orphelins à la racine → src/app/api/ ────────
for folder in nightlights notam places privatejet satellites sentinel social telegram-intel usgs wikipedia wildfire; do
  if [ -d "$folder" ]; then
    echo "→ $folder/ → src/app/api/$folder/"
    mkdir -p "src/app/api/$folder"
    cp -r "$folder"/* "src/app/api/$folder/"
    rm -rf "$folder"
  fi
done

# ── Vérification finale ───────────────────────────────────────
echo ""
echo "✅ Structure finale:"
find src -type f | sort

echo ""
echo "📁 Fichiers à la racine (doit rester ici):"
ls -la *.json *.ts *.yaml .gitignore 2>/dev/null || true

echo ""
echo "🚀 Commit et push..."
git add -A
git status
git commit -m "fix: restructure src/ — déplace tous les fichiers au bon endroit"
git push origin main

echo ""
echo "✅ DONE — repo corrigé, Render va auto-redéployer"
