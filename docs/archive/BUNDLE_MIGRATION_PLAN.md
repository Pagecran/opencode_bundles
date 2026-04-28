# Bundle Migration Plan

Archived: this content has been consolidated into `../../ARCHITECTURE.md` and `../../BUNDLE_AUTHORING.md`.

Plan de migration du repo vers le modele defini par `BUNDLE_SPEC.md` et `RFC-0001-BUNDLE_ARCHITECTURE.md`.

## 1. Objectif

Passer d un modele ou une partie du catalogue metier vit cote bridge hote a un modele ou:

- le bridge hote reste minimal
- le bundle contient le registre des methodes
- les skills suivent la source de verite bundle-side

## 2. Priorites

Ordre recommande:

1. Fixer le format de manifest et le runtime bundle-side
2. Aligner skills, prerequis et execution bundle-side
3. Migrer Blender vers ce modele
4. Migrer Unreal vers ce modele
5. Normaliser Teams et M365 sur la meme source de verite

Pourquoi commencer par les bundles eux-memes:

- c est la que doit vivre la logique produit
- c est la que doivent vivre les prerequis, schemas et verifications
- c est la que les skills doivent trouver leur source de verite

La structure actuellement visee est:

- bundles OpenCode dans `D:\opencode_bundles`
- bridges et modules host-side versionnes eux aussi dans `D:\opencode_bundles`
- copie documentee ensuite vers les emplacements reels de Blender et Unreal

Arborescence recommande a date:

```text
D:\opencode_bundles/
  blender/
  teams/
  unreal/
  bridges/
    opencode_blender_bridge/
    opencode_unreal_bridge/
```

Pourquoi Blender juste apres:

- le plugin OpenCode est deja fin
- `execute_code` existe deja cote addon
- la migration peut valider le modele sans toucher a du C++

## 3. Etape A - socle commun bundle-side

Creer un socle partage par les bundles complexes dans `package/runtime/`.

Livrables:

- `method_registry.ts`
- `dispatcher.ts`
- `capability_resolver.ts`
- format de manifest initial dans `package/methods/`
- check de coherence skills versus methods

Responsabilites:

- charger les manifests
- verifier les prerequis
- resoudre la strategie d execution
- formater les erreurs
- exposer les methodes disponibles dans la session courante
- centraliser la source de verite pour les skills

## 4. Etape B - Blender

### 4.1 Cible

Conserver l addon comme bridge de transport et d execution, mais sortir progressivement les handlers metier de l addon.

Pre-etape obligatoire:

- gerer les sources de `opencode_blender_bridge` dans `bridges/opencode_blender_bridge/`
- documenter la copie vers le workgroup Blender centralise
- documenter la strategie de synchronisation bundle plus bridge

### 4.2 Ce qui reste cote addon Blender

- socket server
- events
- `ping`
- `get_capabilities`
- `execute_code`
- primitives techniques stables comme screenshot si necessaire

### 4.3 Ce qui migre cote bundle Blender

- catalogues scene, shader, animation, geometry nodes, assets, workflows
- compositions de plusieurs actions
- logique de validation metier
- documentation methodes et skills

### 4.4 Premiere vague recommandee

Migrer d abord les workflows de plus haut niveau:

- `create_material_and_assign`
- `apply_library_material_to_object`
- `scatter_library_asset_on_surface`
- `create_string_to_curves_object`

Raison:

- ce sont des commandes metier evidentes
- elles composent deja plusieurs operations
- elles prouvent rapidement la valeur du modele bundle-side

### 4.5 Strategie technique Blender

- definir un manifest par methode dans `blender/package/methods/`
- stocker les scripts Python dans `blender/package/scripts/blender/`
- faire executer ces scripts via `blender_request(method: "execute_code")`
- faire retourner des objets JSON stables

### 4.6 Critere de sortie Blender phase 1

- une nouvelle methode Blender peut etre ajoutee sans modifier l addon
- les skills Blender ne documentent plus de handlers addon-specifiques si une version bundle-side existe
- les sources addon lues par les developpeurs et agents sont dans `bridges/opencode_blender_bridge/`

## 5. Etape C - Unreal

### 5.1 Cible

Reduire le plugin Unreal a un bridge minimal equivalent en philosophie au bridge Blender.

Contrainte de deploiement:

- le plugin Unreal est deploye avec le fork Unreal
- il ne faut pas compter sur un override par projet pour absorber rapidement des variations de workflow
- toute evolution du bridge doit donc etre plus rare, plus generique et plus stable
- les sources du plugin Unreal devraient etre gerees dans `bridges/opencode_unreal_bridge/`

### 5.2 Precondition critique

Ajouter une primitive generique d execution editor-side, par exemple:

- `run_python`
- ou `execute_editor_python`

Cette primitive devient la base de la migration.

### 5.3 Ce qui reste cote plugin Unreal

- transport TCP JSONL
- session et evenements
- `ping`
- `get_capabilities`
- primitives techniques stables
- execution sur le bon thread editor

### 5.4 Ce qui migre hors du plugin Unreal

- `load_level`
- operations Sequencer metier
- operations shading metier
- operations Data Layers metier
- operations Movie Render Graph de haut niveau

### 5.5 Strategie technique Unreal

- manifests dans `unreal/package/methods/`
- scripts Python editor dans `unreal/package/scripts/unreal/`
- execution via primitive generique du plugin
- validation bundle-side des prerequis et des versions du bridge

### 5.6 Premiere vague recommandee

Migrer d abord:

- `load_level`
- lecture simple d etat editor si possible
- un workflow shading simple

Raison:

- ce sont des besoins frequents
- ils montrent vite la fin du cycle recompilation C++ pour les workflows

### 5.7 Critere de sortie Unreal phase 1

- ajouter un nouveau workflow Unreal ne demande plus de recompiler le plugin
- le plugin n expose plus que des primitives techniques et stables
- les changements du plugin Unreal deviennent exceptionnels malgre son mode de deploiement engine/fork

## 6. Etape D - Teams et M365

### 6.1 Cible

Faire respecter aux bundles Teams et M365 la meme discipline de source de verite unique que pour Blender et Unreal, meme sans bridge hote.

### 6.2 Ce qui doit etre normalise cote bundles Teams et M365

- registre unique des methodes Teams et M365
- schemas d arguments et de retours
- prerequis auth par methode
- scopes et permissions associes aux operations
- doc skills alignee sur les methodes reellement supportees

### 6.3 Travaux recommandes

- relier chaque methode Teams ou M365 a ses scopes delegues attendus
- distinguer clairement prerequis login, prerequis consentement et prerequis methode
- verifier automatiquement que les skills Teams et M365 n annoncent pas de permissions absentes ou non gerees
- garder les appels Graph derriere des methodes bundle stables quand c est possible

### 6.4 Critere de sortie Teams et M365

- les prerequis auth et permissions sont visibles dans la source de verite bundle-side
- la doc Teams et M365 ne depend pas uniquement de connaissance implicite ou de configuration orale

## 7. Etape E - skills et doc

Une fois Blender et Unreal engages:

- standardiser le format des methodes documentees
- verifier automatiquement que les skills referencent des methodes existantes
- idealement generer une partie des skills depuis les manifests

Livrables possibles:

- script de verification de coherence
- script de generation de tableaux parametres
- rapport des methodes documentees mais absentes

## 8. Etape F - gouvernance

Avant d ajouter un nouveau bundle host-backed, verifier:

- la primitive generique d execution existe-t-elle
- la source de verite bundle-side est-elle definie
- la checklist bundle a-t-elle ete suivie
- le bridge hote reste-t-il sous controle

## 9. Definition of done globale

La migration peut etre consideree reussie quand:

- Blender et Unreal ont un registre bundle-side pour les nouvelles methodes
- Teams et M365 decrivent leurs prerequis auth et permissions dans la meme source de verite que leurs methodes
- les bridges hotes sont reduits a des primitives stables
- les skills sont alignees sur le catalogue reel
- les nouvelles fonctionnalites ne forcent plus une double modification skill plus bridge

## 10. Actions concretes immediates

Les trois prochaines actions recommandees sont:

1. Creer le format initial de manifest pour Blender et Unreal
2. Migrer un workflow Blender haut niveau via `execute_code`
3. Ajouter la primitive generique d execution cote Unreal

Actions suivantes juste apres:

1. Etendre le format de manifest aux prerequis auth et permissions Teams et M365
2. Verifier la coherence skills versus methodes pour les trois bundles
