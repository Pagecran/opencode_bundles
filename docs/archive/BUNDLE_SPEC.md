# Pagecran OpenCode Bundle Specification

Archived: this content has been consolidated into `../../ARCHITECTURE.md` and `../../BUNDLE_AUTHORING.md`.

Statut: draft interne
Portee: bundles OpenCode Pagecran presents et futurs

Ce document fixe les principes d architecture a respecter pour concevoir un bundle OpenCode.
L objectif est double:

- accelerer la creation de nouveaux bundles
- eviter le couplage entre skills, code hote, et outils exposes

Il joue le meme role qu une specification de reference: ce n est pas juste un memo de projet, c est la base de conception a suivre.

## 1. Mots clefs normatifs

Les termes suivants sont utilises au sens normatif:

- DOIT: exigence obligatoire
- NE DOIT PAS: exigence interdite
- DEVRAIT: forte recommandation, derogation justifiee seulement si necessaire
- PEUT: option autorisee

## 2. Vocabulaire

- Bundle: package OpenCode livrable a l utilisateur
- Plugin OpenCode: code local du bundle qui expose les outils a OpenCode
- Bridge hote: composant tourne dans l application cible, par exemple addon Blender ou plugin Unreal
- Skill: document d usage pour guider l agent sur les workflows et parametres
- Methode bundle: action metier exposee a l agent, par exemple `load_level`
- Primitive hote: operation de bas niveau stable exposee par le bridge, par exemple `ping`, `execute_code`, `capture_viewport`
- Manifest methode: description structuree d une methode bundle, de ses parametres, prerequis, et mode d execution

## 3. Problemes a eviter

Cette specification repond a trois problemes observes:

- duplication du catalogue de methodes entre skills et bridge hote
- recompilation ou redeploiement du bridge a chaque nouvelle action metier
- glissement de la logique produit dans l addon/plugin hote au lieu du bundle

Exemple de symptome a eviter:

- la skill decrit `load_level`
- le bridge ne connait pas `load_level`
- il faut modifier le plugin hote pour ajouter `load_level`

Ce schema NE DOIT PAS etre la structure cible d un bundle.

## 4. Principe directeur

Le principe central est:

- thin bridge, thick bundle

Autrement dit:

- le bridge hote DOIT rester petit, stable, et generique
- le bundle DOIT contenir le registre des methodes, les schemas, les workflows, les scripts, et les skills

La logique metier DOIT vivre cote bundle.
La logique d acces a l application cible DOIT vivre cote hote.

## 5. Deux profils de bundle

Tous les bundles ne se ressemblent pas. La specification distingue deux profils.

### 5.1 Bundle hostless

Exemples: Teams / Microsoft Graph, Microsoft 365 / Graph.

Dans ce cas:

- il n y a pas de bridge externe dans une application tierce
- le plugin OpenCode parle directement a une API ou a un service
- les methodes metier PEUVENT etre implementees directement dans le plugin OpenCode

La source de verite reste cote bundle.

### 5.2 Bundle host-backed

Exemples: Blender, Unreal, plus generalement tout DCC ou application desktop.

Dans ce cas:

- un bridge tourne dans l application cible
- le bridge expose un transport et quelques primitives generiques
- les methodes metier DOIVENT etre definies cote bundle, pas cote bridge

## 6. Repartition des responsabilites

### 6.1 Ce qui appartient au bridge hote

Le bridge hote DOIT gerer seulement:

- transport IO: socket, stdio, pipe, ou equivalent
- gestion de session et connexions persistantes
- evenements push si l hote les supporte
- execution sur le bon thread de l application hote
- primitives generiques stables
- introspection minimale de l environnement hote
- capture de screenshots ou blobs si necessaire

Le bridge hote NE DOIT PAS devenir un catalogue de workflows produit.

### 6.2 Ce qui appartient au bundle

Le bundle DOIT contenir:

- le registre des methodes bundle
- les schemas d arguments et de retour
- la documentation agent-friendly
- les skills
- les scripts ou procedures d execution
- les compositions de workflows
- la validation de compatibilite et de prerequis
- les tests de non regression du catalogue

### 6.3 Ce qui appartient aux skills

Les skills DOIVENT:

- expliquer quand utiliser une methode
- documenter ses parametres et guardrails
- donner le contexte metier et les bonnes pratiques

Les skills NE DOIVENT PAS etre la source de verite du catalogue.
Elles DEVRAIENT etre generees ou au minimum verifiees a partir des manifests.

## 7. Source de verite unique

Chaque bundle DOIT avoir une source de verite unique pour ses methodes.

Cette source DEVRAIT etre un ensemble de manifests structurels, par exemple JSON ou TS strictement typé.

Chaque methode bundle DEVRAIT declarer au minimum:

- nom stable
- domaine
- description courte
- parametres
- schema de retour
- prerequis de capacites hote
- strategie d execution
- mode de verification
- niveau de risque

Les elements suivants DEVRAIENT etre derives de cette source:

- `get_capabilities` bundle-side
- docs skills
- aide CLI eventuelle
- tests de coherence

## 8. Contrat minimal du bridge hote

Pour un bundle host-backed, le bridge hote DOIT viser un contrat minimal et stable.

Cette exigence devient encore plus forte quand le bridge est deploye au niveau d un engine, d un fork ou d une extension centralisee plutot qu au niveau d un projet local.

Ce contrat DEVRAIT contenir:

- `ping`
- `get_capabilities`
- `connect` / `disconnect` si necessaire
- `events_get` / `events_wait` si l hote pousse des evenements
- une primitive d execution generique, par exemple `execute_code`, `run_python`, `run_editor_script`

Selon le host, il PEUT aussi contenir:

- `capture_viewport`
- `read_selection`
- `read_host_state`
- transfert de fichier temporaire

Le bridge hote NE DEVRAIT PAS exposer des dizaines de commandes metier nommees comme:

- `load_level`
- `assign_material`
- `create_shot`
- `scatter_asset`

Ces actions DEVRAIENT etre construites cote bundle a partir des primitives.

## 9. Exception autorisee

Une commande metier peut vivre cote bridge hote si, et seulement si:

- elle encapsule une contrainte technique impossible a gerer proprement bundle-side
- elle a une vraie valeur de primitive stable et durable
- elle ne depend pas d une logique studio mouvante

Exemples possibles:

- screenshot viewport
- lecture de selection editor
- execution de code sur le main thread
- conversion de donnees host-specifiques tres bas niveau

## 10. Execution des methodes bundle

Une methode bundle host-backed DOIT etre executee via une des strategies suivantes:

- script envoye a l hote via une primitive generique
- procedure composee de plusieurs primitives hotes
- appel direct a une API distante pour les bundles hostless

Pour les bundles DCC, la strategie recommandee est:

- manifest bundle-side
- script host-side stocke dans le bundle
- execution du script via `execute_code` / `run_python`

Le bundle DOIT etre capable de decrire clairement quelle strategie il utilise pour chaque methode.

## 11. Structure recommandee d un bundle

Chaque bundle contient deja au minimum:

- `bundle.json`
- `install.ps1`
- `README.md`
- `package/`

Pour les bundles complexes, la structure recommandee devient:

```text
package/
  plugins/
    <bundle>.ts
  runtime/
    dispatcher.ts
    host_client.ts
    method_registry.ts
    capability_resolver.ts
  methods/
    editor/
      load_level.json
    shading/
      assign_material.json
  scripts/
    blender/
      editor/
        load_level.py
    unreal/
      editor/
        load_level.py
  skills/
    ...
```

Interpretation de cette structure:

- `plugins/`: expose peu d outils OpenCode, le plus souvent generiques
- `runtime/`: coeur bundle-side de dispatch et validation
- `methods/`: source de verite du catalogue
- `scripts/`: implementation host-side pilotee par le bundle
- `skills/`: documentation agent-friendly, derivee si possible

## 11.1 Localisation des sources host-side

Pour un bundle host-backed, les sources du bridge hote DOIVENT etre versionnees dans un emplacement canonique controle et documente au sein du workspace `D:\opencode_bundles`.

Cet emplacement canonique N EST PAS oblige d etre dans le dossier du bundle lui-meme.
Il peut vivre ailleurs dans le monorepo si c est la structure retenue par l equipe.

Structure recommandee a date:

- sources host-side sous `bridges/` a la racine du monorepo, directement dans des dossiers nommes par bridge
- payload bundle dans `blender/`, `unreal/`, `teams/`

Raison:

- la spec, les skills, le runtime bundle-side et le bridge evoluent ensemble
- il faut une revue atomique des changements de contrat
- les agents et developpeurs doivent pouvoir lire la vraie implementation sans dependre d un dossier externe implicite
- la source de verite technique ne doit pas etre eparpillee entre plusieurs emplacements opaques

Le mode de deploiement PEUT rester externe ou centralise.
En revanche, la source NE DOIT PAS etre maintenue seulement dans un emplacement implicite non documente.

Si un bridge doit etre partage avec un autre depot ou un fork applicatif, une des approches suivantes DEVRAIT etre utilisee:

- emplacement canonique dans ce monorepo
- mirror des sources dans un depot de reference connu
- subtree
- submodule
- synchronisation automatisee clairement documentee

Le point non negociable est le suivant:

- un agent travaillant sur le bundle doit pouvoir inspecter facilement la version source du bridge correspondant depuis une localisation documentee

## 11.2 Deploiement des bridges hotes

Quand un bridge hote est deploye hors du bundle OpenCode, le deploiement DOIT etre documente.

Un script de deploiement N EST PAS obligatoire des la premiere copie si l operation reste simple et rare.
En revanche, il DEVRAIT etre ajoute des que le process devient recurrent, fragile, ou source d erreurs.

Si un script existe, il DEVRAIT couvrir au minimum:

- source canonique du bridge
- destination de deploiement
- mode copie, sync, ou build
- prerequis eventuels
- commande de verification post-deploiement

Exemples de cibles mentionnees a date:

- addon Blender deploye dans le workgroup Blender centralise
- plugin Unreal deploye dans les sources ou le fork Unreal, pas par projet

Le fait qu un bridge change peu souvent n enleve pas le besoin de scripts et de documentation de deploiement.

## 12. Outils OpenCode recommandes

Un bundle DEVRAIT exposer peu d outils OpenCode.

Pattern recommande:

- un outil de connexion si pertinent
- un outil de deconnexion si pertinent
- un outil de requete generique
- un ou deux outils d evenements
- un ping

Exemples:

- `blender_request`
- `unreal_request`
- `teams_graph_request` ou outils Teams haut niveau si bundle hostless

Le nombre d outils OpenCode NE DOIT PAS exploser avec le nombre de workflows.

## 13. Capacites et negotiation

Le systeme DOIT distinguer:

- capacites du bridge hote
- capacites du bundle
- methodes effectivement disponibles dans la session courante

Une methode bundle PEUT exiger par exemple:

- presence de `execute_code`
- support des evenements
- support screenshot
- version minimale du bridge
- addon ou plugin hote specifique active

Le dispatcher bundle-side DOIT verifier ces prerequis avant execution.

## 14. Versioning

Le versioning DOIT etre separe a trois niveaux:

- version du bundle
- version du bridge hote
- version du protocole de transport

Une methode bundle DOIT pouvoir declarer:

- version minimale du bridge
- compatibilites connues
- fallback eventuel

Le bundle NE DOIT PAS supposer silencieusement qu un bridge ancien supporte des primitives nouvelles.

## 15. Format de reponse

Les reponses DOIVENT etre structurees.

Chaque resultat DEVRAIT privilegier:

- objets JSON clairs
- champs stables
- erreurs actionnables
- identifiants exacts plutot que texte libre

Le texte formate pour humain NE DEVRAIT PAS etre la reponse primaire du bridge.

## 16. Erreurs

Les erreurs DOIVENT etre explicites et separer:

- erreur de transport
- erreur de validation
- erreur de prerequis
- erreur d execution hote
- erreur logique metier

Une erreur utile dit:

- ce qui manque
- ou ca a casse
- ce que l utilisateur ou l agent peut faire ensuite

## 17. Securite

Les bundles host-backed touchent souvent a des applications locales puissantes.
Des regles strictes sont donc necessaires.

- l execution arbitraire DOIT etre consideree comme puissante et dangereuse
- les workflows nommes DEVRAIENT utiliser des scripts bundle-side controles
- les skills NE DOIVENT PAS encourager l execution de code libre si une methode nommee existe deja
- le bridge hote NE DOIT PAS ouvrir plus de surface reseau que necessaire
- les chemins de fichiers et asset paths DOIVENT etre valides et normalises

## 18. Observabilite

Chaque bundle DEVRAIT offrir un minimum d observabilite:

- logs de requetes
- durees d execution
- erreurs structurees
- lecture des capacites courantes
- eventuellement traces de scripts executs

Le but est de diagnostiquer rapidement:

- erreur skill versus erreur manifest
- erreur bundle versus erreur bridge
- erreur protocole versus erreur workflow

## 19. Anti-patterns interdits

Les points suivants NE DOIVENT PAS devenir la norme:

- skill ecrite a la main sans lien avec le vrai catalogue
- bridge hote rempli de commandes produit
- recompilation du plugin hote pour chaque nouvelle action studio
- duplication des schemas d arguments a plusieurs endroits
- documentation qui annonce des methodes absentes
- methode bundle qui depend d un detail d implementation non declare

## 20. Application au repo actuel

### 20.1 Blender

Etat actuel:

- le plugin OpenCode est deja fin et expose `blender_request`
- l addon Blender porte encore un registre de commandes metier
- une primitive generique `execute_code` existe deja

Conclusion:

- la base transport est bonne
- le registre des methodes devrait migrer cote bundle
- les handlers Blender nommes devraient diminuer au profit de scripts bundle-side
- les sources de l addon Blender devraient etre gerees dans `bridges/opencode_blender_bridge/`, avec une copie documentee vers le workgroup centralise

### 20.2 Unreal

Etat actuel:

- le plugin OpenCode est deja fin et expose `unreal_request`
- le plugin Unreal C++ porte encore le catalogue metier
- il manque une primitive generique d execution equivalente a Blender
- le plugin Unreal est deploye avec le fork Unreal, pas installe par projet

Conclusion:

- l architecture actuelle n est pas scalable
- chaque changement du bridge a un cout de diffusion plus eleve qu un simple plugin projet
- Unreal doit evoluer vers un bridge minimal + execution generique + workflows bundle-side

### 20.3 Teams et Microsoft 365

Etat actuel:

- bundles hostless
- les methodes peuvent rester directement dans le plugin OpenCode

Conclusion:

- Teams et M365 n ont pas le meme probleme structurel que Blender et Unreal
- mais ils doivent tout de meme respecter la source de verite unique, des schemas coherents, et des prerequis auth/permissions explicites

## 21. Procedure pour ajouter une nouvelle methode

Procedure normative recommandee:

1. Ajouter le manifest de la methode dans `package/methods/`
2. Declarer ses prerequis et sa strategie d execution
3. Ajouter ou reutiliser un script dans `package/scripts/`
4. Brancher la methode dans le dispatcher bundle-side
5. Regenerer ou verifier la skill correspondante
6. Verifier la coherence avec les capacites du bridge
7. Tester l execution reelle

Si l etape 3 exige de modifier le bridge hote, il faut d abord se demander si une primitive generique manque.
Si oui, il faut ajouter la primitive, pas la methode metier finale.

## 22. Checklist de revue d architecture

Avant d accepter un nouveau bundle ou une evolution majeure, verifier:

- la source de verite des methodes est-elle unique
- la skill est-elle derivee ou au moins verifiee automatiquement
- le bridge hote reste-t-il generique
- l ajout d un workflow impose-t-il une recompilation inutile
- la methode depend-elle de prerequis declares
- les erreurs sont-elles structurees
- la version du bridge est-elle prise en compte
- le design est-il transmissible a un autre developpeur sans contexte oral

## 23. Resume executif

La regle a retenir est simple:

- les bridges hotes fournissent des primitives stables
- les bundles definissent les methodes metier
- les skills documentent les methodes mais ne les inventent pas

Si une nouvelle fonctionnalite oblige a modifier une skill et un bridge hote pour rester synchronises, la structure du bundle est probablement mauvaise.
