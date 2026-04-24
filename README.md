# Pagecran OpenCode Bundles

Monorepo source des bundles OpenCode Pagecran.

## Structure

- `blender/` : bundle Blender actuel, autonome et publiable tel quel
- `m365/` : bundle Microsoft 365 / Graph, axe SharePoint, fichiers, Excel et Teams via Graph
- `teams/` : bundle Teams / Microsoft Graph sans MCP
- `unreal/` : bundle Unreal en cours de demarrage
- `bridges/` : sources canoniques des bridges host-side, directement au premier niveau
- `BUNDLE_SPEC.md` : specification d architecture a respecter pour les bundles OpenCode
- `BUNDLE_RUNTIME_SPEC.md` : spec concrete de ce qui vit dans les bundles, manifests, runtime et prerequis
- `RFC-0001-BUNDLE_ARCHITECTURE.md` : RFC de reference sur la separation bridge / bundle
- `BUNDLE_CHECKLIST.md` : checklist courte de conception et de revue
- `BUNDLE_MIGRATION_PLAN.md` : plan concret de migration Blender / Unreal
- `scripts/build_bundle.ps1` : staging local et publication sur le NAS
- `dist/` : sortie generee localement

## Convention d un bundle

Chaque bundle vit dans un dossier racine dedie, par exemple `blender/`, et contient au minimum :

- `bundle.json`
- `install.ps1`
- `README.md`
- `package/`

Le `bundle.json` porte aussi la version publiee du bundle, par exemple :

```json
{
  "name": "blender",
  "version": "1.0.0"
}
```

## Build et publication

```powershell
Set-ExecutionPolicy -Scope Process Bypass

# build + publication du bundle Blender
.\scripts\build_bundle.ps1 -Bundle blender

# build local uniquement
.\scripts\build_bundle.ps1 -Bundle blender -SkipPublish

# tous les bundles du monorepo
.\scripts\build_bundle.ps1 -Bundle all
```

Publication par defaut vers :

- `\\truenas01\install\_Programmes\opencode_Bundles`

Le script publie un dossier versionne directement sous le bundle, par exemple :

- `\\truenas01\install\_Programmes\opencode_Bundles\blender\1.0.0`

Le meme layout est genere localement dans `dist/`, par exemple :

- `D:\opencode_bundles\dist\blender\1.0.0`

## Ajouter un nouveau bundle

1. Creer un nouveau dossier a la racine, par ex. `m365/`
2. Ajouter son `bundle.json`
3. Ajouter son `install.ps1` et son `package/`
4. Lancer `.\scripts\build_bundle.ps1 -Bundle m365`
