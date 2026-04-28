# Bundle Runtime Spec

Archived: this content has been consolidated into `../../ARCHITECTURE.md` and `../../BUNDLE_AUTHORING.md`.

Statut: draft de travail
Portee: contenu interne des bundles OpenCode
References: `BUNDLE_SPEC.md`, `RFC-0001-BUNDLE_ARCHITECTURE.md`

Ce document se concentre sur ce qui vit dans les bundles eux-memes.
Il ne traite pas d abord des bridges, mais de la structure runtime, du registre des methodes, et du contrat entre skills, manifests et implementation.

## 1. Objectif

Un bundle DOIT contenir sa logique produit.

Cela veut dire:

- le catalogue des methodes vit dans le bundle
- les prerequis vivent dans le bundle
- les schemas d arguments et de retours vivent dans le bundle
- les skills derivent du bundle ou sont au minimum alignees sur lui

Le bridge, quand il existe, n est qu un support technique.

## 2. Structure cible d un bundle

Structure recommandee pour un bundle non trivial:

```text
<bundle>/
  bundle.json
  install.ps1
  README.md
  package/
    package.json
    tsconfig.json
    plugins/
      <bundle>.ts
    runtime/
      dispatcher.ts
      method_registry.ts
      capability_resolver.ts
      validators.ts
      output.ts
    methods/
      <domain>/
        <method>.json
    scripts/
      blender/
      unreal/
    skills/
      ...
    generated/
      ... optional
```

Interpretation:

- `plugins/` expose peu d outils OpenCode
- `runtime/` contient la logique commune bundle-side
- `methods/` est la source de verite du catalogue
- `scripts/` contient les scripts ou snippets host-side pilotes par le bundle
- `skills/` documente les workflows reels
- `generated/` peut contenir doc ou fichiers derives

## 3. Responsabilites par dossier

### 3.1 `plugins/`

Le plugin OpenCode DOIT rester fin.

Il DOIT:

- exposer les outils publics du bundle
- ouvrir la connexion ou l auth si necessaire
- deleguer au runtime bundle-side

Il NE DOIT PAS devenir l endroit ou l on code methode par methode toute la logique produit.

### 3.2 `runtime/`

Le runtime bundle-side DOIT centraliser:

- chargement du registre
- resolution de methode
- validation des arguments
- verification des prerequis
- choix de la strategie d execution
- normalisation du resultat
- normalisation des erreurs

### 3.3 `methods/`

Chaque fichier de `methods/` decrit une methode bundle.

Ce dossier est la source de verite a partir de laquelle on peut:

- exposer le catalogue courant
- verifier les skills
- generer de la doc
- detecter les prerequis

### 3.4 `scripts/`

Pour un bundle host-backed, `scripts/` contient les implementations pilotees par le bundle.

Exemples:

- script Python execute dans Blender
- script Python editor execute dans Unreal
- snippets reutilisables

Pour un bundle hostless, ce dossier peut etre vide.

### 3.5 `skills/`

Les skills DOIVENT expliquer l usage, pas definir la verite technique.

Elles DEVRAIENT etre:

- generees depuis `methods/`
- ou verifiees automatiquement contre `methods/`

## 4. Forme minimale d une methode

Chaque methode bundle DOIT declarer:

- `name`
- `domain`
- `description`
- `kind`
- `args`
- `returns`
- `requires`
- `execution`
- `verify`
- `risk`

## 5. Champs recommandes d un manifest

Format de travail recommande en JSON:

```json
{
  "name": "load_level",
  "domain": "editor",
  "description": "Open a level in the editor from an asset path.",
  "kind": "host-backed",
  "args": {
    "level_path": {
      "type": "string",
      "required": true,
      "description": "Unreal asset or package path"
    }
  },
  "returns": {
    "type": "object"
  },
  "requires": {
    "bridge_methods": ["run_python"],
    "bridge_version": ">=0.1.0"
  },
  "execution": {
    "strategy": "host_script",
    "tool": "unreal_request",
    "script": "unreal/editor/load_level.py"
  },
  "verify": {
    "strategy": "followup_method",
    "method": "get_editor_state"
  },
  "risk": "write"
}
```

## 6. Semantique des champs

### 6.1 `kind`

Valeurs recommandees:

- `host-backed`
- `hostless`

`host-backed` signifie qu une application locale tierce execute une partie du travail.
`hostless` signifie que le bundle parle directement a un service ou une API.

### 6.2 `args`

Chaque argument DEVRAIT declarer:

- type
- required ou non
- description
- enum eventuel
- default eventuel

### 6.3 `returns`

Le schema de retour DEVRAIT etre stable et exploitable par un agent.

Le texte libre ne DEVRAIT PAS etre le retour principal.

### 6.4 `requires`

`requires` permet de declarer les prerequis d execution.

Exemples possibles:

- `bridge_methods`
- `bridge_version`
- `events`
- `screenshots`
- `env`
- `scopes`
- `auth`

### 6.5 `execution`

`execution` decrit comment la methode est executee.

Strategies recommandees:

- `host_script`
- `host_request`
- `compose`
- `direct_api`

### 6.6 `verify`

`verify` decrit comment confirmer l effet de la methode.

Strategies possibles:

- `none`
- `followup_method`
- `event`
- `readback`
- `screenshot`

### 6.7 `risk`

Valeurs recommandees:

- `read`
- `write`
- `destructive`

## 7. Exemple host-backed Blender

```json
{
  "name": "create_material_and_assign",
  "domain": "shader",
  "description": "Create a material from a template and assign it to an object.",
  "kind": "host-backed",
  "args": {
    "name": { "type": "string", "required": true },
    "object_name": { "type": "string", "required": false },
    "template_name": {
      "type": "string",
      "required": false,
      "default": "principled_pbr"
    }
  },
  "returns": { "type": "object" },
  "requires": {
    "bridge_methods": ["execute_code"]
  },
  "execution": {
    "strategy": "host_script",
    "tool": "blender_request",
    "script": "blender/shader/create_material_and_assign.py"
  },
  "verify": {
    "strategy": "followup_method",
    "method": "get_object_info"
  },
  "risk": "write"
}
```

## 8. Exemple hostless Teams / M365

```json
{
  "name": "teams_send_channel_message",
  "domain": "channels",
  "description": "Send a message to a Teams channel.",
  "kind": "hostless",
  "args": {
    "team_name": { "type": "string", "required": false },
    "channel_name": { "type": "string", "required": false },
    "message": { "type": "string", "required": true }
  },
  "returns": { "type": "object" },
  "requires": {
    "auth": true,
    "scopes": ["ChannelMessage.Send"]
  },
  "execution": {
    "strategy": "direct_api",
    "tool": "teams_send_channel_message"
  },
  "verify": {
    "strategy": "none"
  },
  "risk": "write"
}
```

Ici, le point important est que les scopes et prerequis auth appartiennent au bundle, pas uniquement a la skill.
Le meme principe vaut pour un bundle M365 plus large qui couvre sites, fichiers, Excel et Teams via Microsoft Graph.

## 9. Dispatcher bundle-side

Le dispatcher bundle-side DEVRAIT suivre ce flux:

1. charger la methode depuis `methods/`
2. valider les arguments recus
3. verifier les prerequis
4. choisir la strategie d execution
5. executer
6. normaliser le resultat
7. effectuer la verification si demandee
8. retourner un objet structure

Pseudo-flux:

```text
resolve manifest -> validate args -> check requires -> execute -> verify -> format output
```

## 10. Capability resolver

Le runtime DEVRAIT avoir un resolver explicite des capacites.

Il sert a repondre a des questions comme:

- ce bridge supporte-t-il `execute_code` ?
- cette session Teams est-elle authentifiee ?
- les scopes requis sont-ils disponibles ?
- les screenshots sont-ils supportes ?

Le capability resolver evite de coder ces conditions en dur dans chaque methode.

## 11. Validation

Le bundle DOIT valider avant execution:

- types des arguments
- presence des requis
- contraintes simples sur les valeurs
- coherence de la methode choisie

Pour un bundle host-backed, il DEVRAIT aussi valider:

- disponibilite de la primitive hote attendue
- compatibilite de version du bridge

Pour un bundle hostless, il DEVRAIT aussi valider:

- etat auth
- scopes / permissions declares
- env vars ou config requises

## 12. Erreurs bundle-side

Le bundle DEVRAIT normaliser ses erreurs avec des categories simples.

Exemples:

- `validation_error`
- `missing_capability`
- `auth_required`
- `missing_scope`
- `execution_error`
- `verification_error`

Une erreur utile contient au minimum:

- categorie
- message
- methode
- detail optionnel
- action possible ensuite

## 13. Skills et generation

Une skill DEVRAIT pouvoir etre reconstruite a partir de:

- `name`
- `description`
- `args`
- `requires`
- `verify`
- notes de domaine specifiques

La partie domaine peut rester ecrite a la main.
Le catalogue de methodes, lui, ne devrait pas diverger du manifest.

## 14. Verification de coherence

Le repo DEVRAIT a terme avoir un check qui detecte:

- methode documentee mais absente de `methods/`
- methode declaree sans skill correspondante si elle devrait etre publique
- prerequis annonces dans la skill mais absents du manifest
- scopes Teams utilises sans declaration
- bridge method requise mais absente des capacites attendues

## 15. Ordre recommande pour ajouter une methode

1. Creer le manifest dans `package/methods/`
2. Ajouter ou reutiliser la strategie d execution
3. Ajouter les validations specifiques si necessaire
4. Ajouter la verification post-action
5. Aligner ou generer la skill
6. Tester en reel

Si l etape 2 demande une nouvelle primitive bridge-side, il faut verifier qu il s agit bien d une primitive et pas d un workflow produit deguise.

## 16. Priorite pratique pour ce repo

Sur ce repo, la priorite n est pas d abord le bridge.
La priorite est:

- fixer le modele interne des bundles
- creer un format stable de manifest
- faire converger skills, prerequis et execution bundle-side
- ensuite seulement migrer les workflows hors des bridges quand c est pertinent

## 17. Resume court

Ce qui nous interesse dans les bundles est simple:

- ou vit la verite des methodes
- comment une methode est decrite
- comment elle est executee
- comment elle est verifiee
- comment la skill reste alignee

Si ces cinq points sont clairs bundle-side, le reste devient beaucoup plus simple.
