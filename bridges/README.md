# Host Bridges

Ce dossier est l emplacement canonique des sources host-side dans `D:\opencode_bundles`.

Principe:

- les bundles OpenCode restent dans `blender/`, `teams/`, `unreal/`
- les bridges ou addons host-side vivent directement au premier niveau dans `bridges/`
- pour l instant, un simple copier des dossiers suffit; les scripts de deploiement viendront si le besoin se confirme

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
- A ce stade, il n y a pas besoin d ajouter des scripts de deploiement tant que le copier manuel reste exceptionnel.
- Si les copies deviennent recurrentes ou fragiles, un script de deploiement pourra etre ajoute plus tard.
