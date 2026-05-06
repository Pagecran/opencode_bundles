# Host Bridges

Ce dossier est l emplacement canonique des sources host-side dans `D:\opencode_bundles`.

Principe:

- les bundles OpenCode restent dans `blender/`, `teams/`, `unreal/`
- les bridges ou addons host-side vivent directement au premier niveau dans `bridges/`
- un script de synchro manuelle vers les repos cibles existe: `scripts/sync_bridges.ps1`

Objectif:

- eviter de melanger payload bundle et code host-side
- garder une source canonique unique dans le monorepo
- documenter clairement ou deployer Blender et Unreal

Structure cible:

```text
bridges/
  opencode_blender_bridge/
    __init__.py
    ...
  opencode_unreal_bridge/
    opencode_unreal_bridge.uplugin
    Source/
    ...
```

Notes:

- `teams/` n a pas de bridge host-side et n apparait donc pas ici.
- Les bridges restent separes du cycle de deploiement des bundles OpenCode utilisateur.
- Blender se copie vers `R:\Workgroup_Blender\Extension\System\opencode_blender_bridge`.
- Unreal se copie vers le repo engine-side local, typiquement `D:\EpicGames\UnrealEngine\Engine\Plugins\Developer\opencode_unreal_bridge` ou `D:\UnrealEngine\Engine\Plugins\Developer\opencode_unreal_bridge` selon la workstation.
- La synchro reste volontairement manuelle pour l instant, via `scripts/sync_bridges.ps1`.
