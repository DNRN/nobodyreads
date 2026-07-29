## Summary

<!-- One or two sentences: what changed and why. -->

### What changed

<!--
Bullet list grouped by area/file. Be specific — name the routes, components,
or invariants touched, not just "updated X". A reviewer should be able to
map each bullet to a hunk in the diff.
-->

### Test plan

<!--
Required. State exactly what a reviewer must do to prove this works: concrete
commands, the routes or editor flows to exercise, and the expected result for
each step so "works" is falsifiable. "Tested locally" is not a test plan. Use
[x] for steps you actually ran, [ ] for steps a reviewer should run.
-->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

Manual steps:

1. <!-- e.g. npm run dev, visit /admin/posts, publish a draft → expect it at / -->
2. <!-- expected result for each step -->

### Breaking changes

<!--
Any change to package.json `exports`, factory signatures, the admin-context
contract, the site-template contract, or the schema — with the migration a
consuming host needs. Write "None" if the published surface is unchanged.
-->

None
