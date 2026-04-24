# Bundle Checklist

Checklist courte pour creer, revoir ou refactorer un bundle OpenCode.

Reference: `BUNDLE_SPEC.md`
RFC associee: `RFC-0001-BUNDLE_ARCHITECTURE.md`

## 1. Checklist de conception

- Le bundle est-il `hostless` ou `host-backed` ?
- La source de verite des methodes est-elle unique ?
- Le bridge hote est-il minimal et generique ?
- La logique metier vit-elle cote bundle ?
- Les skills documentent-elles le catalogue reel plutot qu un catalogue imagine ?

## 2. Checklist bridge hote

- Le bridge expose-t-il seulement transport, session, evenements, ping, capabilities et primitives generiques ?
- Une nouvelle methode oblige-t-elle a modifier le bridge ? Si oui, est-ce vraiment une primitive et pas un workflow ?
- Le bridge valide-t-il correctement les chemins, ids et donnees sensibles ?
- Les erreurs de transport et d execution sont-elles separees ?
- Les reponses sont-elles structurees et stables ?

## 3. Checklist bundle

- La methode est-elle declaree dans un manifest ou registre bundle-side ?
- Les arguments et retours sont-ils schemas explicitement ?
- Les prerequis de capacites sont-ils declares ?
- La strategie d execution est-elle claire ?
- La verification post-action est-elle definie ?

## 4. Checklist hostless / API bundles

- Les prerequis auth sont-ils declares explicitement ?
- Les scopes ou permissions demandes sont-ils rattaches aux methodes concernees ?
- Les erreurs distantes sont-elles normalisees cote bundle ?
- La doc annonce-t-elle seulement les operations reellement supportees ?
- Les details d endpoint ou de provider restent-ils caches derriere des methodes bundle stables ?

## 5. Checklist skills

- La skill decrit-elle une methode existante et testable ?
- Les parametres documentes correspondent-ils au runtime reel ?
- Les guardrails sont-ils realistes et utiles ?
- La skill evite-t-elle de devenir la source de verite ?
- La doc est-elle derivee ou au moins verifiee depuis le catalogue bundle-side ?

## 6. Checklist ajout d une methode

- Ajouter le manifest bundle-side
- Declarer prerequis et schemas
- Ajouter le script ou workflow d execution
- Brancher la methode dans le dispatcher
- Mettre a jour ou regenerer la skill
- Verifier les capacites requises
- Tester en reel

## 7. Checklist anti-patterns

- Eviter un bridge rempli de commandes studio
- Eviter la duplication manifest / skill / bridge
- Eviter de recompiler Unreal pour chaque workflow
- Eviter une skill qui annonce des methodes absentes
- Eviter une methode qui depend d un prerequis non declare

Pour un bundle hostless comme Teams ou M365, remplacer mentalement `bridge` par `provider/API`: la meme discipline de source de verite et d alignement doc/runtime s applique.

## 8. Question de controle finale

Si j ajoute une nouvelle fonctionnalite demain, puis-je le faire sans modifier le bridge hote, sauf si une primitive generique manque vraiment ?

Si la reponse est non, l architecture doit etre reconsideree.
