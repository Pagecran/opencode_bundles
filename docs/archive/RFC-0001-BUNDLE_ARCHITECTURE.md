# RFC-0001 - Thin Bridge, Thick Bundle

Archived: this content has been consolidated into `../../ARCHITECTURE.md` and `../../BUNDLE_AUTHORING.md`.

Statut: propose
Version RFC: 0001
Portee: tous les bundles OpenCode Pagecran
Reference normative: `BUNDLE_SPEC.md`

## 1. Resume

Cette RFC formalise le modele d architecture a utiliser pour les bundles OpenCode.

Decision principale:

- le bridge hote doit etre minimal, stable et generique
- le bundle doit porter le registre des methodes, les schemas, les workflows, les scripts et les skills

Formule courte:

- thin bridge, thick bundle

## 2. Contexte

Les bundles actuels montrent une bonne separation au niveau des outils OpenCode, mais pas encore au niveau de la logique metier.

Exemples observes:

- `blender_request` et `unreal_request` sont deja generiques cote plugin OpenCode
- en revanche, le catalogue reel des actions est encore cote addon Blender ou plugin Unreal
- les skills peuvent donc annoncer des methodes non supportees par le bridge reel

Cette situation cree:

- duplication des definitions
- risque de desynchronisation
- dette de maintenance
- recompilation inutile cote Unreal

## 3. Probleme a resoudre

Nous voulons eviter le schema suivant:

```text
skill -> methode nommee dans le bridge hote -> API de l application
```

Ce schema a trois effets negatifs:

- la skill n est pas la vraie source de verite
- ajouter une methode oblige a modifier le bridge hote
- la logique produit migre progressivement dans l addon ou le plugin natif

## 4. Decision

Le modele cible devient:

```text
skill -> methode bundle-side -> dispatcher bundle-side -> primitive hote generique -> API de l application
```

Implications directes:

- les methodes bundle sont definies cote bundle
- les bridges hotes ne portent que des primitives stables
- les skills documentent le catalogue bundle-side
- les workflows sont composes dans le bundle, pas dans le bridge

## 5. Ce qui est dans le scope

Cette RFC couvre:

- Blender
- Unreal
- Teams et autres bundles hostless
- la structure recommandee des bundles
- la gouvernance du catalogue de methodes

Cette RFC ne couvre pas:

- le packaging reseau externe des bundles
- la politique de distribution NAS
- le format exact final des manifests

## 6. Regles d architecture adoptees

### 6.1 Source de verite unique

Chaque bundle doit avoir une source de verite unique pour son catalogue de methodes.

Cette source doit contenir, pour chaque methode:

- nom stable
- domaine
- description
- parametres
- schema de retour
- prerequis
- strategie d execution
- mode de verification

Les skills ne doivent pas inventer le catalogue a la main.

### 6.2 Bridge hote minimal

Le bridge hote doit se limiter a:

- transport
- session
- evenements
- ping
- capabilities
- execution sur le bon thread
- primitives generiques stables

Il ne doit pas devenir un catalogue de commandes studio.

### 6.3 Bundle epais

Le bundle doit contenir:

- le registre des methodes
- la validation des arguments
- la resolution des prerequis
- les scripts host-side pilotes par le bundle
- les workflows composes
- la doc et les skills

Cette regle vaut aussi pour les bundles hostless.
L absence de bridge hote ne dispense pas un bundle d avoir une source de verite unique, des schemas stables et des prerequis explicites.

### 6.4 Capacites et prerequis

Le bundle doit verifier explicitement:

- la version du bridge
- les primitives requises
- les options de l hote disponibles
- les dependances externes necessaires

### 6.5 Co-localisation des sources

Pour un bundle host-backed, les sources du bridge devraient etre versionnees dans une localisation canonique controlee et documentee au sein de `D:\opencode_bundles`.
Cette localisation peut etre le dossier du bundle lui-meme ou un emplacement dedie dans le meme monorepo.

Recommendation actuelle:

- utiliser `bridges/` a la racine du monorepo comme emplacement dedie des sources host-side, avec un dossier de premier niveau par bridge

Objectifs:

- garder une revue atomique doc plus runtime plus bridge
- permettre a un agent ou developpeur de lire le vrai contrat sans aller chercher un dossier externe implicite
- eviter qu un bridge vivant hors repo devienne une deuxieme source de verite non maitrisee

Consequence pratique:

- si les bridges ne vivent pas dans le dossier du bundle lui-meme, leur emplacement canonique et leur mode de deploiement doivent etre documentes explicitement

## 7. Contrat minimal attendu pour les bridges hotes

Pour un bundle host-backed, le bridge devrait fournir au minimum:

- `ping`
- `get_capabilities`
- une connexion persistante si necessaire
- des evenements si utiles
- une primitive generique d execution, par exemple `execute_code` ou `run_python`

Des primitives speciales sont autorisees si elles sont vraiment stables et host-specific, par exemple:

- screenshot viewport
- lecture de selection
- interrogation d etat editeur

## 8. Commandes a sortir du bridge

Les commandes suivantes ne devraient pas vivre nativement cote bridge, sauf exception argumentee:

- `load_level`
- `assign_material`
- `create_shot`
- `scatter_asset`
- tout workflow fortement lie a un besoin studio changeant

Ces commandes devraient devenir des methodes bundle-side executees via scripts ou composition de primitives.

## 9. Cas particuliers par bundle

### 9.1 Blender

Constat:

- le plugin OpenCode est deja fin
- l addon Blender garde encore un registre de handlers metier
- `execute_code` existe deja, ce qui facilite la migration

Decision locale:

- conserver l addon comme bridge et runtime d execution
- deplacer progressivement le catalogue metier dans le bundle
- garder seulement quelques primitives generiques et techniques cote addon
- gerer les sources de l addon Blender dans l emplacement canonique defini dans `D:\opencode_bundles`, et documenter son deploiement vers l extension centralisee

### 9.2 Unreal

Constat:

- le plugin OpenCode est deja fin
- le plugin Unreal C++ garde le catalogue metier
- il manque encore une primitive d execution generique equivalente a Blender
- le plugin Unreal est destine a etre deploye avec le fork Unreal, pas comme plugin par projet

Decision locale:

- reduire le plugin Unreal a un bridge minimal
- ajouter une primitive generique d execution editor-side
- implementer les workflows cote bundle pour eviter la recompilation systematique
- traiter toute evolution du plugin Unreal comme une evolution a cout de diffusion eleve, donc a stabiliser tres en amont

### 9.3 Teams et Microsoft 365

Constat:

- bundles hostless
- pas de bridge dans une application tierce

Decision locale:

- les methodes peuvent rester dans le plugin OpenCode
- elles doivent malgre tout respecter une source de verite unique et des schemas stables
- les scopes, prerequis auth, comportements de refresh token et contraintes Graph doivent etre declares cote bundle, pas disperses uniquement dans les skills
- la doc utilisateur et les skills doivent rester alignees sur les methodes et permissions effectivement supportees

## 10. Structure cible recommandee

```text
package/
  plugins/
    <bundle>.ts
  runtime/
    dispatcher.ts
    method_registry.ts
    host_client.ts
    capability_resolver.ts
  methods/
    <domain>/
      <method>.json
  scripts/
    blender/
    unreal/
  skills/
    ...
```

## 11. Consequences attendues

Benefices:

- ajout de nouvelles methodes plus rapide
- moins de duplication skill versus bridge
- meilleure portabilite d un bundle a l autre
- meilleure transmission a d autres developpeurs
- reduction de la recompilation Unreal

Couts:

- besoin d un dispatcher bundle-side plus solide
- besoin d un format de manifest stable
- besoin probable d outils de generation ou de verification des skills

## 12. Exceptions acceptees

Une methode peut rester cote bridge seulement si:

- elle represente une primitive technique stable
- elle ne traduit pas un workflow studio mouvant
- elle est difficilement exprimable bundle-side sans perte importante

Toute exception devrait etre documentee dans le bundle concerne.

## 13. Criteres d adoption

Cette RFC peut etre consideree comme adoptee quand:

- un format de manifest bundle-side est etabli
- Blender utilise ce modele pour de nouvelles methodes
- Unreal expose une primitive generique d execution
- Teams aligne ses methodes, prerequis auth et docs sur la meme source de verite bundle-side
- les nouvelles skills ne decrivent plus de methodes absentes du runtime reel

## 14. Plan initial d application

- Etape 1: formaliser les manifests bundle-side
- Etape 2: introduire le dispatcher bundle-side commun
- Etape 3: migrer Blender vers des methodes bundle-side pilotes par `execute_code`
- Etape 4: ajouter la primitive generique manquante cote Unreal
- Etape 5: migrer les workflows Unreal hors du plugin C++
- Etape 6: ajouter verification ou generation des skills depuis les manifests

## 15. Statut actuel

Cette RFC est proposee et coherente avec `BUNDLE_SPEC.md`.
Elle sert de base de decision pour les prochaines evolutions du repo.
